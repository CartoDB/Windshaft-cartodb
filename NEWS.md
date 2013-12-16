1.6.0 -- 20YY-MM-DD
-------------------

* Update cartodb-redis dependency to "~0.2.0"

1.5.2 -- 2013-12-05
-------------------

Bug fixes:

* Fix configuration-level compatibility with versions prior to 1.5 (#96)
* Fix use of old layergroups on mapnik upgrade (#97)

1.5.1 -- 2013-11-28
-------------------

Bug fixes:

* Survive presence of malformed CartoCSS in redis (#94)
* Accept useless point-transform:scale directives (#93)

1.5.0 -- 2013-11-19
-------------------

NOTE: new configuration directives `postgres_auth_pass` and
      `postgres.password` added; see config/environments/*.example
      for documentation.

Improvements:

* Add support for configuring database connection passwords
* Optionally read user-specific database_host and database_password
  from redis as per CartoDB-2.5.0 model (#88, #89)
* Do not force ending dot in SQL-API hostname, for easier testing

Bug fixes:

* Return CORS headers when creating layergroups via GET (windshaft/#92)
* Fix http status on database authentication error (windshaft/#94)
* Fix text-face-name error at layergroup creation (windshaft/#93)

Other changes:

* CartoDB redis interaction delegated to "cartodb-redis" module


1.4.1 -- 2013-11-08
-------------------

* Fix support for exponential notation in CartoCSS filter values (#87)

1.4.0 -- 2013-10-31
-------------------

* Add Support for Mapnik-2.2.0 (#78)

1.3.6 -- 2013-10-11
-------------------

* Restore support for node-0.8.9 accidentally dropped by 1.3.5
  NOTE: needs removing node_modules/windshaft and re-running npm install

1.3.5 -- 2013-10-03
-------------------

* Fixing apostrophes in CartoCSS
* Fix "sql/table must contain zoom variable" error when using
  "[ zoom > 3]" CartoCSS snippets (note the space)
* Fix backward compatibility handling of sqlapi.host configuration (#82)
* Fix error for invalid text-name in CartoCSS (#81)
* Do not let anonymous requests use authorized renderer caches 

1.3.4
------

NOTE: configuration sqlapi.host renamed to sqlapi.domain
      (support for "sqlapi.host" is retained for backward compatibility)

* Improve empty CartoCSS error message
* Improve invalid mapnik-geometry-type CSS error message
* Fix race condition in localization of network resources

1.3.3
------
* Set Last-Modified header to allow for 304 responses
* Add profiling support (needs useProfiler in env config file)
* Fix double-checking for layergroups with no interactivity
* Log full layergroup config at creation time (#76)

1.3.2
------
* Set default layergroup TTL to 2 hours
* Serve multilayer tiles and grid with persistent cache control

1.3.1
------
* Fix deadlock on new style creation
* Fix database authentication with multi-table layergroups
* Add tile and grid fetching checks at layergroup creation time
* Fix SQL error reporting to NOT split on newline
* Fix support for CartoCSS attachments

1.3.0
------
* Change stats format for multilayer map token request, see
  http://github.com/Vizzuality/Windshaft-cartodb/wiki/Redis-stats-format

1.2.1
------
* Fix multilayer post from firefox
* Fix multilayer cartocss layer name handling

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
