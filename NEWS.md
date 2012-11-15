1.1.3 (DD//MM//YY)
-----
* CartoCSS versioning
 * Mapnik-version dependent default styles
 * Enhance 2.0 -> 2.1 transforms:
  * styles with conditional markers

1.1.2 (DD//MM//YY)
-----
* CartoCSS versioning
 * Fix use of "style_version" with GET (inline styles)
 * Enhance 2.0 -> 2.1 transforms:
  * styles with no semicolon
  * markers shift due to geometry clipping


1.1.1 (DD//MM//YY)
-----
* Add support for persistent client cache headers
* Fix crash on unknown user (#55)
* Add /version entry point
* CartoCSS versioning
 * Include style_version in GET /style response
 * Support style_version and style_convert parameters in POST /style request
 * Support style_version in GET /:z/:x/:y request

1.1.0 (30/10/12)
=======
* Add /version entry point
* CartoCSS versioning
 * Include version in GET /style response
 * Support version and convert parameters in POST /style request
 * Autodetect target mapnik version and let config override it
 * Add tools/reset_styles script to batch-reset (and optionally convert) styles
* Configurable logging format (#4)
* Detailed error on missing user metadata 
* Properly handle unauthenticated requests for metadata
* Accept "api_key" in addition to "map_key",
  both in query_string and POST body (#38)
* Add ./configure script
* Allow listening on host IP
* Replaced environment configs by .example ones
* Fixed some issues with cluster2

1.0.0 (03/10/12)
-----
* Migrated to node 0.8.x.

0.9.0 (25/09/12)
-----
* External resources in CartoCSS
* Added X-Cache-Channel header in all the tiler GET requests
* Small fixes
