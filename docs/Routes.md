This document list all routes available in Windshaft-cartodb Maps API server.

## Routes list

1. `GET (?:/api/v1/map|/tiles/layergroup)/:token/:z/:x/:y@:scale_factor?x.:format {:token(f),:z(f),:x(f),:y(f),:scale_factor(t),:format(f)} (1)`
<br/>Notes: Mapnik retina tiles [0]

1. `GET (?:/api/v1/map|/tiles/layergroup)/:token/:z/:x/:y.:format {:token(f),:z(f),:x(f),:y(f),:format(f)} (1)`
<br/>Notes: Mapnik tiles [0]

1. `GET (?:/api/v1/map|/tiles/layergroup)/:token/:layer/:z/:x/:y.(:format) {:token(f),:layer(f),:z(f),:x(f),:y(f),:format(f)} (1)`
<br/>Notes: Per :layer rendering based on :format [0]

1. `GET (?:/api/v1/map|/tiles/layergroup) {} (1)`
<br/>Notes: Map instantiation [0]

1. `GET (?:/api/v1/map|/tiles/layergroup)/:token/:layer/attributes/:fid {:token(f),:layer(f),:fid(f)} (1)`
<br/>Notes: Endpoint for info windows data, alternative for sql api when tables are private [0]

1. `GET (?:/api/v1/map|/tiles/layergroup)/static/center/:token/:z/:lat/:lng/:width/:height.:format {:token(f),:z(f),:lat(f),:lng(f),:width(f),:height(f),:format(f)} (1)`
<br/>Notes: Static Maps API [0]

1. `GET (?:/api/v1/map|/tiles/layergroup)/static/bbox/:token/:west,:south,:east,:north/:width/:height.:format {:token(f),:west(f),:south(f),:east(f),:north(f),:width(f),:height(f),:format(f)} (1)`
<br/>Notes: Static Maps API [0]

1. `GET / {} (1)`
<br/>Notes: Welcome message

1. `GET /version {} (1)`
<br/>Notes: Return relevant module versions: mapnik, grainstore, etc

1. `GET /tiles/:table/:z/:x/:y.* {:table(f),:z(f),:x(f),:y(f)} (1)`
<br/>Notes: **[DEPRECATED]** Per :table tiles rendering

1. `GET /tiles/:table/style {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** Style for :table

1. `GET (?:/api/v1/map/named|/tiles/template)/:template_id/jsonp {:template_id(f)} (1)`
<br/>Notes: Named maps JSONP instantiation [1]

1. `GET (?:/api/v1/map/named|/tiles/template)/:template_id {:template_id(f)} (1)`
<br/>Notes: Named map retrieval (w/ API KEY) [1]

1. `GET (?:/api/v1/map/named|/tiles/template) {} (1)`
<br/>Notes: List named maps (w/ API KEY) [1]

1. `GET /tiles/:table/infowindow {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** retrieve info window template for :table

1. `GET /tiles/:table/map_metadata {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** retrieve map metadata for :table

1. `GET /health {} (1)`
<br/>Notes: Healt check

1. `OPTIONS (?:/api/v1/map|/tiles/layergroup) {} (1)`
<br/>Notes: CORS [0]

1. `OPTIONS /tiles/:table/:z/:x/:y.* {:table(f),:z(f),:x(f),:y(f)} (1)`
<br/>Notes: **[DEPRECATED]** CORS

1. `OPTIONS /tiles/:table/style {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** CORS

1. `OPTIONS (?:/api/v1/map/named|/tiles/template)/:template_id {:template_id(f)} (1)`
<br/>Notes: CORS [1]

1. `POST (?:/api/v1/map|/tiles/layergroup) {} (1)`
<br/>Notes: Map instantiation [0]

1. `POST /tiles/:table/style {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** Create style for :table

1. `POST (?:/api/v1/map/named|/tiles/template) {} (1)`
<br/>Notes: Create named map (w/ API KEY) [1]

1. `POST (?:/api/v1/map/named|/tiles/template)/:template_id {:template_id(f)} (1)`
<br/>Notes: Instantiate named map [1]

1. `DELETE /tiles/:table/style {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** Delete :table style

1. `DELETE (?:/api/v1/map/named|/tiles/template)/:template_id {:template_id(f)} (1)`
<br/>Notes: Delete named map (w/ API KEY) [1]

1. `DELETE /tiles/:table/flush_cache {:table(f)} (1)`
<br/>Notes: **[DEPRECATED]** Flush internal caches for :table

1. `PUT (?:/api/v1/map/named|/tiles/template)/:template_id {:template_id(f)} (1)`
<br/>Notes: Update a named map (w/ API KEY) [1]

## Optional deprecated routes

- [0] `/tiles/layergroup` is deprecated and `/api/v1/map` should be used but we keep it for now.
- [1] `/tiles/template` is deprecated and `/api/v1/map/named` should be used but we keep it for now.

## How to generate the list of routes

Something like the following patch should do the trick

```javascript
diff --git a/lib/cartodb/cartodb_windshaft.js b/lib/cartodb/cartodb_windshaft.js
index 477a4c2..f69eebb 100644
--- a/lib/cartodb/cartodb_windshaft.js
+++ b/lib/cartodb/cartodb_windshaft.js
@@ -242,6 +242,20 @@ var CartodbWindshaft = function(serverOptions) {
         }
     });

+    var format = require('util').format;
+    var routesNotes = Object.keys(ws.routes.routes)
+        .map(function(method) { return ws.routes.routes[method]; })
+        .reduce(function(previous, current) { current.map(function(r) { previous.push(r) }); return previous;}, [])
+        .map(function(route) {
+            return format("\n1. `%s %s {%s} (%d)`\n<br/>Notes: [DEPRECATED]? ",
+                route.method.toUpperCase(),
+                route.path,
+                route.keys.map(function(k) { return format(':%s(%s)', k.name, k.optional ? 't' : 'f'); } ).join(','),
+                route.callbacks.length
+            );
+        });
+    console.log(routesNotes.join('\n'));
+
     return ws;
 };


```
