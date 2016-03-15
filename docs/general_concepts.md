# General Concepts

The following concepts are the same for every endpoint in the API except when it's noted explicitly.

## Auth

By default, users do not have access to private tables in CartoDB. In order to instantiate a map from private table data an API Key is required. Additionally, to include some endpoints, an API Key must be included (e.g. creating a Named Map).

To execute an authorized request, `api_key=YOURAPIKEY` should be added to the request URL. The param can be also passed as POST param. Using HTTPS is mandatory when you are performing requests that include your `api_key`.

## Errors

Errors are reported using standard HTTP codes and extended information encoded in JSON with this format:

```javascript
{
  "errors": [
    "access forbidden to table TABLE"
  ]
}
```

If you use JSONP, the 200 HTTP code is always returned so the JavaScript client can receive errors from the JSON object.

## CORS support

All the endpoints, which might be accessed using a web browser, add CORS headers and allow OPTIONS method.
