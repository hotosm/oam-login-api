# OAM Login API

This is a quickly thrown together POC.
It could replace the auth part of the existing OAM API / browser.

> [!NOTE]
> The only reason we need this is because of @hapi/iron usage,
> which uses it's own asymmetric encryption algorithm we can't
> easily re-implement in another language.

The migration OpenAerialMap is piecemeal:
- We are migrating the read-API away to use STAC.
- The write-API will remain in place.
- To upload data from a browser, the user needs to access the existing
  https://github.com/hotosm/oam-browser frontend, which sets a cookie
  called `oam-session` for login/authentication.
- We wish to iframe the uploader portion of oam-browser into the new frontend.
  However, Google cannot allow login from inside iFrames.
- Instead, we have this microservice that can issue an `oam-session` cookie
  to the new frontend, but also be backward compatible to pass into the
  iFrame'ed old uploader.

The service would likely be running behind a reverse proxy, mapping
the /oauth/callback subpath to override the OAM-API route under the
same subpath.

## Dotenv config

DOMAIN=https://api.openaerialmap.org
GOOGLE_CLIENT_ID=xxx
GOOGLE_CLIENT_SECRET=xxx
GOOGLE_REDIRECT_URI=https://api.openaerialmap.org/oauth/callback
IRON_PASSWORD=the_iron_password_used_in_oam_api_cookiePassword_param
