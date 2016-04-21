This document list all routes available in Windshaft-cartodb Maps API server.

## Routes list

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:z/:x/:y@:scale_factor?x.:format {:user(f),:token(f),:z(f),:x(f),:y(f),:scale_factor(t),:format(f)} (1)`
<br/>Notes: Mapnik retina tiles [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:z/:x/:y.:format {:user(f),:token(f),:z(f),:x(f),:y(f),:format(f)} (1)`
<br/>Notes: Mapnik tiles [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:layer/:z/:x/:y.(:format) {:user(f),:token(f),:layer(f),:z(f),:x(f),:y(f),:format(f)} (1)`
<br/>Notes: Per :layer rendering based on :format [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:layer/attributes/:fid {:user(f),:token(f),:layer(f),:fid(f)} (1)`
<br/>Notes: Endpoint for info windows data, alternative for sql api when tables are private [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/static/center/:token/:z/:lat/:lng/:width/:height.:format {:user(f),:token(f),:z(f),:lat(f),:lng(f),:width(f),:height(f),:format(f)} (1)`
<br/>Notes: Static Maps API [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format {:user(f),:token(f),:west(f),:south(f),:east(f),:north(f),:width(f),:height(f),:format(f)} (1)`
<br/>Notes: Static Maps API [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:layer/widget/:widgetName {:user(f),:token(f),:layer(f),:widgetName(f)} (1)`
<br/>Notes: By :widgetName per :layer widget [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/:token/:layer/widget/:widgetName/search {:user(f),:token(f),:layer(f),:widgetName(f)} (1)`
<br/>Notes: By :widgetName per :layer widget search [0]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup) {:user(f)} (1)`
<br/>Notes: Map instantiation [0]

1. `POST (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup) {:user(f)} (1)`
<br/>Notes: Map instantiation [0]

1. `GET (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id/jsonp {:user(f),:template_id(f)} (1)`
<br/>Notes: Named maps JSONP instantiation [1]

1. `POST (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id {:user(f),:template_id(f)} (1)`
<br/>Notes: Instantiate named map [1]

1. `OPTIONS (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup) {:user(f)} (1)`
<br/>Notes: CORS [0]

1. `GET (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id/:layer/:z/:x/:y.(:format) {:user(f),:template_id(f),:layer(f),:z(f),:x(f),:y(f),:0(f),:format(f)} (1)`
<br/>Notes: Per :layer fixed URL named map tiles [1]

1. `GET (?:/api/v1/map|/user/:user/api/v1/map|/tiles/layergroup)/static/named/:template_id/:width/:height.:format {:user(f),:template_id(f),:width(f),:height(f),:format(f)} (1)`
<br/>Notes: Static map for named maps [1]

1. `POST (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template) {:user(f)} (1)`
<br/>Notes: Create named map (w/ API KEY) [1]

1. `PUT (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id {:user(f),:template_id(f)} (1)`
<br/>Notes: Update a named map (w/ API KEY) [1]

1. `GET (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id {:user(f),:template_id(f)} (1)`
<br/>Notes: Named map retrieval (w/ API KEY) [1]

1. `DELETE (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id {:user(f),:template_id(f)} (1)`
<br/>Notes: Delete named map (w/ API KEY) [1]

1. `GET (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template) {:user(f)} (1)`
<br/>Notes: List named maps (w/ API KEY) [1]

1. `OPTIONS (?:/api/v1/map/named|/user/:user/api/v1/map/named|/tiles/template)/:template_id {:user(f),:template_id(f)} (1)`
<br/>Notes: CORS [1]

1. `GET /health {} (1)`
<br/>Notes: Health check

1. `GET / {} (1)`
<br/>Notes: Welcome message

1. `GET /version {} (1)`
<br/>Notes: Return relevant module versions: mapnik, grainstore, etc


## Optional deprecated routes

- [0] `/tiles/layergroup` is deprecated and `/api/v1/map` should be used but we keep it for now.
- [1] `/tiles/template` is deprecated and `/api/v1/map/named` should be used but we keep it for now.

## How to generate the list of routes

Something like the following patch should do the trick

```javascript
diff --git a/lib/cartodb/server.js b/lib/cartodb/server.js
index 5f62850..bca377d 100644
--- a/lib/cartodb/server.js
+++ b/lib/cartodb/server.js
@@ -215,6 +215,20 @@ module.exports = function(serverOptions) {
      * END Routing
      ******************************************************************************************************************/

+    var format = require('util').format;
+    var routesNotes = app._router.stack
+        .filter(function(handler) { return !!handler.route; })
+        .map(function(handler) {
+            return format("\n1. `%s %s {%s} (1)`\n<br/>Notes: [DEPRECATED]? ",
+                Object.keys(handler.route.methods)[0].toUpperCase(),
+                handler.route.path,
+                handler.keys.map(function(k) {
+                    return format(':%s(%s)', k.name, k.optional ? 't' : 'f');
+                }).join(',')
+            );
+        });
+    console.log(routesNotes.join('\n'));
+
     return app;
 };


```
