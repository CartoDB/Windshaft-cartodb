Windshaft-CartoDB
==================

This is the CartoDB map tiler. It extends Windshaft with some extra functionality and custom filters for authentication

Look at lib/cartodb/server_options for more on config

* reads dbname from subdomain and cartodb redis for pretty tile urls
* configures windshaft to publish cartodb_id as the interactivity layer
* gets the default geometry type from the cartodb redis store
* provides a infowindow endpoint for windshaft
* provides a map_metadata endpoint for windshaft


Install
-------
```
git clone
npm install
node app.js [development | production]
```


URLs
----

**TILES**

[GET] subdomain.cartodb.com/tiles/:table_name/:z/:x/:y.[png|png8|grid.json]

Args:

* sql - plain SQL arguments
* interactivity - specify the column to use in UTFGrid
* cache_buster - if needed you can add a cachebuster to make sure you're rendering new
* geom_type - override the cartodb default


**STYLE**

[GET/POST] subdomain.cartodb.com/tiles/:table_name/style

Args:

* style - the style in CartoCSS you want to set


**INFOWINDOW**

[GET] subdomain.cartodb.com/tiles/:table_name/infowindow

Args:

* infowindow - returns contents of infowindow from CartoDB.


**MAP METADATA**

[GET] subdomain.cartodb.com/tiles/:table_name/map_metadata

Args:

* infowindow - returns contents of infowindow from CartoDB.


All GET requests are wrappable with JSONP using callback argument, including the UTFGrid map tile call.