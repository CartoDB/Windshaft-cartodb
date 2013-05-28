1.2.2
------

1.2.1
------
* Require Windshaft-0.12.1 to fix multilayer post from firefox

1.2.0
------
* Multilayer API changes
  * Layers passed by index in grid fetching url
  * Interactivity only specified in layergroup config
  * Embed cache_buster within token 
  * Use ISO format for last_modified timestamp
* Expected LZMA encoding changed to base64

1.1.10
------
* Fix regression with default interactivity parameter (#74)
* More verbose logging for SQL api connection errors
* Write stats for multilayer map token request

1.1.9
-----
* Handle SQL API errors by requesting no Varnish cache
* Fix X-Cache-Channel for multilayer (by token) responses
* Add last_modified field to layergroup creation response (#72)
* Deprecate signal handler for USR1, add handler for USR2 (#71)
* Fix support for ampersend characters in CartoCSS
* Add support for LZMA compressed GET parameters
* Add support for creating layergroups via GET

1.1.8
-----
* Require Windshaft-0.9.1, to reduce harmfulness of cache_buster param

1.1.7 (DD//MM//YY)
-----
* Do not let /etc/services confuse FD checker (munin plugin)
* Multilayer support (#72)
* Expose renderer settings in the environment config files

1.1.6 (19//02//13)
-----
* Require windshaft 0.8.5, fixing some stability issues
  and providing cache info on request
* Require grainstore 0.10.9, fixing an issue with multi-geom markers
* Enhance run_tests.sh to allow running single tests and skipping preparation
* Fix async throws in getGeometryType, getInfoWindow and getMapMetadata
* Survive connection refusals from redis
* Add maxConnection environment configuration, default to 128

1.1.5 (DD//MM//YY)
-----
* Fix bogus cached return of utf grid for fully contained tiles (#67)

1.1.4 (DD//MM//YY)
-----
* Reduce default extent to allow for consistent proj4 round-tripping 
* Enhance reset_styles script to use full configuration (#62)
* Have reset_styles script also drop extended keys (#58)
* Fix example postgis parameter for simplifying input geoms (#63)
* Add row_limit to example config (#64)

1.1.3 (30//11//12)
-----
* Fix reset_styles script to really skip extended keys
* CartoCSS versioning
 * Mapnik-version dependent default styles
 * Enhance 2.0 -> 2.1 transforms:
  * styles with conditional markers
  * scale arrow markers by 50%

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
