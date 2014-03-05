1.8.5 -- 2014-03-DD
-------------------

Enhancements:

 - Set statsd prefix for all endpoints 
 - Respond with a permission denied on attempt to access map tiles waiving
   signature of someone who had not left any (#170)
 - Do not log an error on GET / (#177)
 - Do not UNWATCH on every redis client release (#161)
 - Include API docs (#164)
 - Add "cacheDns" statsd setting in the example configs
 - Do not send duplicated stats on template instanciation
 - Do not die on dns resolution errors (#178, #180)

Bug fixes:

 - Do not cache map creation responses (#176)

1.8.4 -- 2014-03-03
-------------------

Enhancements:

 - Really skip CDB_TableMetadata lookup for sql affected by no tables (#169)
 - Upgrade windshaft to 0.19.2, see node_modules/windshaft/NEWS
 - Clarify obscure "ECONNREFUSED" error message (#171)
 - Change some http status responses to be more appropriate to the case
 - Forbid using map signatures of foreign users (#172)
 - Forbid instanciating templates of foreign users (#173)
 - Allow passing environment configuration name via NODE_ENV to app.js
 - Print environment configuration name on app start

Bug fixes:

 - Fix database connection settings on template instanciation (#174)

1.8.3 -- 2014-02-27
-------------------

Enhancements:

 - Upgrades windshaft to 0.19.1 with many performance improvements,
   See node_modules/windshaft/NEWS 
 - Improve speed of instanciating a map (#147, #159, #165)
 - Give meaningful error on attempts to use map tokens
   with attribute service (#156)
 - Reduce sql-api communication timeout, and allow overriding (#167)
   [ new sqlapi.timeout directive, defaults to 100 ms ]
 - Do not query CDB_TableMetadata for queries affected by no tables (#168)

1.8.2 -- 2014-02-25
-------------------

Enhancements:

 * Allow using ":host" as part of statsd.prefix (#153)
 * Expand "addCacheChannel" stats
 * Allow using GET with sql-api for queries shorter than configured len (#155)
   [ new sqlapi.max_get_sql_length directive, defaults to 2048 ]
 * Do not log an error for a legit request requiring no X-Cache-Channel

Bug fixes:

 * Fix munin plugin after log format changes (#154)

1.8.1 -- 2014-02-19
-------------------

Enhancements:

 * Use log4js logger (#138)

Bug fixes:

 * Always generate X-Cache-Channel for token-based tile responses (#152)

1.8.0 -- 2014-02-18
-------------------

Enhancements:

 * Add script to flush caches (#140)
 * Add script to list templates
 * Add statsd support (#139)
 * Add support for specifying a varnish password
 * Avoid sending multiple varnish invalidation at once (#135)
 * Tested with node-0.10 (#141)
 * Use single redis pooler for torque and grainstore
 * Reduce cost of garbage collection for localized resources
 * Allow limiting number of templates for each user (#136)
 * Allow configuring TTL of mapConfigs via "mapConfigTTL"

1.7.1 -- 2014-02-11
-------------------

Enhancements:

 * Disable debug logging unless "debug" config param evaluates to true (#137)
 * Require windshaft 0.17.2 for further reducing log noise (#137)

1.7.0 -- 2014-02-11
-------------------

New features:

 * Add support for torque tiles (#112)
 * Add attributes service (#118)
 * Implement Unified Map API (#126)
 * Make endpoints configurable (#127)

Enhancements:

 * Allow specifying fixed sqlapi host address (#117)
 * Include template hash in template instance response, to keep caches
   of different instances separated (#105)

Bug fixes:

 * Allow space padding in template variables usage (#129)
 * Allow passing numbers as values for numeric template variables (#130)


1.6.3 -- 2014-01-30
-------------------

Bug fixes: 

* layergroup accept both map_key and api_key (#91)
* Fix public instanciation of signed template accessing private data (#114)
* Fix show_style in presence of complex styles
* Fix use of maxzoom in layergroup config (via windshaft-0.15.1)

Enhancements:

* Add support for instanciating a template map with JSONP (#116)
* Stop processing XML on renderer creation, not needed anymore since 1.6.1
  introduced on-demand XML generation.

1.6.2 -- 2014-01-23
-------------------

Bug fixes:

* Fix support for long (>64k chars) queries in layergroup creation (#111)

Enhancements:

* Enhance tools/show_style to accept an environment parameter and
  print XML style now it is not in redis anymore (#110)
* Support CORS in template instanciation endpoint (#113)

1.6.1 -- 2014-01-15
-------------------

Bug fixes:

* Drop cache headers from error responses (#107)
* Localize external CartoCSS resources at renderer creation time (#108)

1.6.0 -- 2014-01-10
-------------------

New features:

 * Add 'user_from_host' directive to generalize username extraction (#100)
 * Implement signed template maps (#98)


Other changes:

 * Update cartodb-redis dependency to "~0.3.0"
 * Update redis-server dependency to "2.4.0+"

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
