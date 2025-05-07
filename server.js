import express from 'express';
import axios from 'axios';
import cookieParser from 'cookie-parser';
import Iron from '@hapi/iron';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cookieParser());

const {
  DOMAIN,
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI,
  IRON_PASSWORD
} = process.env;

const COOKIE_NAME = 'oam-session';
const COOKIE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days


function getCookieDomain() {
    try {
      const url = new URL(DOMAIN);
      return url.hostname === 'localhost' ? undefined : url.hostname;
    } catch {
      return undefined;
    }
}

// Middleware to validate and refresh the cookie (replace hapi 'keepAlive: true')
async function validateAndRefreshSession(req, res, next) {
    const sealed = req.cookies[COOKIE_NAME];
    if (!sealed) return next(); // No session
  
    try {
      const session = await Iron.unseal(sealed, IRON_PASSWORD, Iron.defaults);
      req.session = session; // attach to request for downstream use
  
      // Refresh TTL by resealing and re-setting the cookie
      const refreshed = await Iron.seal(session, IRON_PASSWORD, Iron.defaults);
      res.cookie(COOKIE_NAME, refreshed, {
        maxAge: COOKIE_TTL_MS,
        httpOnly: false,
        sameSite: 'Lax',
        secure: getCookieDomain() !== undefined,
        domain: getCookieDomain(),
        path: '/',
      });
    } catch (err) {
      console.warn('Invalid session cookie. Ignoring.');
      res.clearCookie(COOKIE_NAME); // matches Hapi’s `clearInvalid: true`
    }
  
    console.log('Valid oam-session cookie found & successfully refreshed')
    next();
}
  
app.use(validateAndRefreshSession);

// Google OAuth2 endpoint
app.get('/oauth/google', (req, res) => {
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  url.searchParams.set('redirect_uri', GOOGLE_REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');

  res.redirect(url.toString());
});

// OAuth2 callback endpoint
app.get('/oauth/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('Missing code');

  try {
    // Exchange code for tokens
    const { data: tokenData } = await axios.post('https://oauth2.googleapis.com/token', null, {
      params: {
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code'
      }
    });

    const { access_token } = tokenData;

    // Get user info
    const { data: userInfo } = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: {
        Authorization: `Bearer ${access_token}`
      }
    });

    // Create session object (format used by OAM)
    const session = {
      _id: userInfo.id,
      contact_email: userInfo.email,
      name: userInfo.name,
      profile_pic_uri: userInfo.picture,
      images: [],
    };

    // Encrypt with Iron (must match hapi-auth-cookie settings)
    const sealed = await Iron.seal(session, IRON_PASSWORD, Iron.defaults);

    // Original Hapi config
    // ttl: 24 * 60 * 60 * 7000, // 7 days  // express: maxAge
    // keepAlive: true,                     // express: not applicable
    // password: config.cookiePassword,     // express: used by Iron.seal()
    // cookie: config.sessionCookieKey,     // express: name of cookie
    // domain: config.hostTld === 'localhost' ? null : config.hostTld, // express: domain
    // clearInvalid: true,                  // express: not applicable
    // redirectTo: false,                   // express: not applicable
    // validateFunc: User.validateSession.bind(User), // express: not applicable
    // isHttpOnly: false, // so JS can see it  // express: httpOnly
    // isSecure: config.isCookieOverHTTPS      // express: secure

    // Set cookie (same name, options as in Hapi config)
    res.cookie(COOKIE_NAME, sealed, {
        maxAge: COOKIE_TTL_MS,
        httpOnly: false,  // so legacy oam-browser js code can access it
        sameSite: 'Lax',
        secure: getCookieDomain() !== undefined,
        domain: getCookieDomain(),
        path: '/',
    });

    res.send('Login successful. Cookie set.');
  } catch (err) {
    console.error(err);
    res.status(500).send('OAuth callback error');
  }
});

app.get('/me', (req, res) => {
    if (req.session) {
      res.json({ session: req.session });
    } else {
      res.status(401).send('Not logged in');
    }
});

app.listen(3000, () => {
  console.log('OAuth microservice listening at http://localhost:3000');
});
