# Changelog

## 2.58.0

Released 2016-mm-dd

Announcements:
 - Upgrades camshaft to [0.29.2](https://github.com/CartoDB/camshaft/releases/tag/0.29.2).

Bug fixes:
 - Return full list of nodes in response metadata.


## 2.57.0

Released 2016-04-07

Announcements:
 - Upgrades camshaft to [0.28.1](https://github.com/CartoDB/camshaft/releases/tag/0.28.1).


## 2.56.0

Released 2016-07-04

Announcements:
 - Upgrades camshaft to [0.27.0](https://github.com/CartoDB/camshaft/releases/tag/0.27.0).


## 2.55.0

Released 2016-07-04

Enhancements:
 - Skip null values for quantification methods generating null values.

Announcements:
 - Uses new configuration for camshaft: analysis node has an associated user/owner.
 - Upgrades camshaft to [0.26.0](https://github.com/CartoDB/camshaft/releases/tag/0.26.0).


## 2.54.0

Released 2016-06-30

Improvements:
 - Errors with context: replaced `turbo-carto` error type by `layer` type.

Announcements:
 - Upgrades camshaft to [0.23.0](https://github.com/CartoDB/camshaft/releases/tag/0.23.0)


## 2.53.5

Released 2016-06-29

Bug fixes:
 - Uses node list so identical nodes are not de-duplicated and can be used with different ids #528.


## 2.53.4

Released 2016-06-28

Announcements:
 - Upgrades camshaft to [0.22.4](https://github.com/CartoDB/camshaft/releases/tag/0.22.4)


## 2.53.3

Released 2016-06-28

Announcements:
 - Upgrades camshaft to [0.22.3](https://github.com/CartoDB/camshaft/releases/tag/0.22.3)


## 2.53.2

Released 2016-06-28

Announcements:
 - Upgrades camshaft to [0.22.2](https://github.com/CartoDB/camshaft/releases/tag/0.22.2)


## 2.53.1

Released 2016-06-28

Announcements:
 - Upgrades camshaft to [0.22.1](https://github.com/CartoDB/camshaft/releases/tag/0.22.1)


## 2.53.0

Released 2016-06-24

Announcements:
 - Upgrades camshaft to [0.22.0](https://github.com/CartoDB/camshaft/releases/tag/0.22.0)


## 2.52.0

Released 2016-06-23

Announcements:
 - Upgrades camshaft to [0.21.0](https://github.com/CartoDB/camshaft/releases/tag/0.21.0)


## 2.51.0

Released 2016-06-21

Enhancements:
 - Split turbo-carto adapter substitutions tokens query.
 - Now errors with context have the same schema. #519
 - Responses with error now return the layer-id to give more info to the user.

Announcements:
 - Upgrades camshaft to [0.20.0](https://github.com/CartoDB/camshaft/releases/tag/0.20.0)


## 2.50.0

Released 2016-06-21

Bug fixes:
 - Pixel size query for turbo-carto adapter using radians and degrees instead of meters.

New features:
 - Add support for min, max, and avg operations in aggregation dataview #513.

Announcements:
 - Upgrades camshaft to [0.19.0](https://github.com/CartoDB/camshaft/releases/tag/0.19.0)


## 2.49.1

Released 2016-06-20

Announcements:
 - Upgrades turbo-carto to [0.12.1](https://github.com/CartoDB/turbo-carto/releases/tag/0.12.1).

Bug fixes:
 - Use an empty array as default value for falsy ramps #512.
 - Use the_geom for intermediate dataviews #511.
 - Pick last update time for layergroupid from analyses results #510.


## 2.49.0

Released 2016-06-15

Announcements:
 - Upgrades camshaft to [0.17.1](https://github.com/CartoDB/camshaft/releases/tag/0.17.1)


## 2.48.0

Released 2016-06-14

Announcements:
 - Upgrades camshaft to [0.15.1](https://github.com/CartoDB/camshaft/releases/tag/0.15.1)
 - Responses with more context info if analysis or turbo-carto fails during map creation.

## 2.47.1

Released 2016-06-13

Announcements:
 - Upgrades camshaft to [0.14.1](https://github.com/CartoDB/camshaft/releases/tag/0.14.1)


## 2.47.0

Released 2016-06-10

Announcements:
 - Upgrades camshaft to [0.14.0](https://github.com/CartoDB/camshaft/releases/tag/0.14.0)


## 2.46.0

Released 2016-06-09

Improvements:
 - Support for substitution tokens in geojson tiles
 - Warn on application start about non-matching dependencies

Announcements:
 - Upgrades windshaft to [2.3.0](https://github.com/CartoDB/camshaft/releases/tag/2.3.0)
 - Upgrades camshaft to [0.13.0](https://github.com/CartoDB/camshaft/releases/tag/0.13.0)
 - Upgrades turbo-carto to [0.11.0](https://github.com/CartoDB/turbo-carto/releases/tag/0.11.0)

Bug fixes:
 - Column provided for geojson renderer should not be null #476
 - Dataviews/widgets adapter working with non sql, non source, and non widgets layers


## 2.45.0

Released 2016-06-02

Improvements:
 - Removes Windshaft's widgets dependency.
 - Makes widgets/dataviews endpoint compatible, but all using dataviews backend instead of widgets from Windshaft.
 - Keeps adding widgets metadata in map instantiations for old clients.

Announcements:
 - Upgrades windshaft to [2.0.1](https://github.com/CartoDB/camshaft/releases/tag/2.0.1 )
 - Upgrades camshaft to [0.12.1](https://github.com/CartoDB/camshaft/releases/tag/0.12.1)
 - Upgrades turbo-carto to [0.10.1](https://github.com/CartoDB/turbo-carto/releases/tag/0.10.1)


## 2.44.1

Released 2016-06-01

Improvements:
 - Extend overviews support to histogram and aggregation dataviews
 - Test improvements


## 2.44.0

Released 2016-05-31

Announcements:
 - Upgrades camshaft to [0.11.0](https://github.com/CartoDB/camshaft/releases/tag/0.11.0)
 - Upgrades turbo-carto to [0.10.0](https://github.com/CartoDB/turbo-carto/releases/tag/0.10.0)

New features:
 - Adds support for sql wrap in all layers

Bug fixes:
 - Fail on turbo-carto invalid quantification methods


## 2.43.1

Released 2016-05-19

Bug fixes:
 - Dataview error when bbox present without query rewrite data #458


## 2.43.0

Released 2016-05-18

New features:
 - Overviews now support dataviews and filtering #449


## 2.42.2

Released 2016-05-17

New features:
 - turbo-carto: mapnik substitution tokens support #455


## 2.42.1

Released 2016-05-17
- Upgraded turbo-carto to fix reversed color scales


## 2.42.0

Released 2016-05-16

Bug fixes:
 - Fix named maps with analysis #453

Enhancements:
 - Use split strategy for head/tails turbo-carto quantification

Announcements:
 - Upgrades turbo-carto to [0.9.0](https://github.com/CartoDB/turbo-carto/releases/tag/0.9.0)


## 2.41.1

Released 2016-05-11

Announcements:
 - Upgrades camshaft to [0.8.0](https://github.com/CartoDB/camshaft/releases/tag/0.8.0)

Bug fixes:
 - Nicer error message when missing sql from layer options #446


## 2.41.0

Released 2016-05-11

Announcements:
 - Upgrades camshaft to [0.7.0](https://github.com/CartoDB/camshaft/releases/tag/0.7.0)


## 2.40.0

Released 2016-05-10

Enhancements:
 - Use original query from source nodes #444

New features:
 - Allow override zoom+center or bbox for static named maps previews #443
 - Analysis layers can have a sql_wrap option to wrap node queries #441


## 2.39.0

Released 2016-05-05

Announcements:
 - Upgrades step-profiler to 0.3.0 to avoid dots in json keys #438
 - Use a more aggressive cache control header for node status endpoint


## 2.38.1

Released 2016-05-05

Announcements:
 - Fixes problem in turbo-carto dependency
 - Removes console usages


## 2.38.0

Released 2016-05-05

Announcements:
 - Upgrades turbo-carto to [0.7.0](https://github.com/CartoDB/turbo-carto/releases/tag/0.7.0)


## 2.37.0

Released 2016-05-03

Announcements:
 - Upgrades camshaft to [0.6.0](https://github.com/CartoDB/camshaft/releases/tag/0.6.0)


## 2.36.1

Released 2016-04-29

Announcements:
 - Upgrades camshaft to [0.5.1](https://github.com/CartoDB/camshaft/releases/tag/0.5.1)


## 2.36.0

Released 2016-04-28

Announcements:
 - Upgrades windshaft to [1.19.0](https://github.com/CartoDB/Windshaft/releases/tag/1.19.0)


## 2.35.0

Released 2016-04-27

Announcements:
 - Upgrades windshaft to [1.18.0](https://github.com/CartoDB/Windshaft/releases/tag/1.18.0)
 - Appends columns to layers from associated dataviews


## 2.34.1

Released 2016-04-27

Announcements:
 - Upgrades windshaft to [1.17.3](https://github.com/CartoDB/Windshaft/releases/tag/1.17.3)


## 2.34.0

Released 2016-04-27

Enhancements:
 - Adds support to return multiple errors in BaseController.sendError #423
 - Starts using turbo-carto dependency

Announcements:
 - Upgrades windshaft to [1.17.2](https://github.com/CartoDB/Windshaft/releases/tag/1.17.2)


## 2.33.1

Released 2016-04-20

Bug fixes:
  - Support unneeded schema names in overviews queries #421


## 2.33.0

Released 2016-04-20

New features:
 - Adds experimental support for analysis and dataviews

Announcements:
 - Upgrades cartodb-psql to 0.6.1 version.
 - Upgrades windshaft to [1.17.1](https://github.com/CartoDB/Windshaft/releases/tag/1.17.1)


## 2.32.0

Released 2016-04-06

New features:
 - Added support for dynamic styling for widgets in named maps

Announcements:
 - Upgrades windshaft to [1.17.0](https://github.com/CartoDB/Windshaft/releases/tag/1.17.0)


## 2.31.2

Released 2016-04-04

Bug fixes:
 - Overviews integration for named layers #400
 - Support wrapped queries in named layers #405


## 2.31.1

Released 2016-03-23

Announcements:
 - Upgrades windshaft to [1.16.1](https://github.com/CartoDB/Windshaft/releases/tag/1.16.1)


## 2.31.0

Released 2016-03-16

Announcements:
 - Upgrades windshaft to [1.16.0](https://github.com/CartoDB/Windshaft/releases/tag/1.16.0)


## 2.30.0

Released 2016-03-15

Announcements:
 - Upgrades windshaft to [1.15.0](https://github.com/CartoDB/Windshaft/releases/tag/1.15.0)


## 2.29.0

Released 2016-03-14

Announcements:
 - Upgrades windshaft to [1.14.0](https://github.com/CartoDB/Windshaft/releases/tag/1.14.0)


## 2.28.0

Released 2016-03-14

New features:
 - Added [turbo-cartocss](https://github.com/CartoDB/turbo-cartocss) to preprocess CartoCSS.


## 2.27.0

Released 2016-03-09

New features:
 - Add [Surrogate-Key](https://github.com/CartoDB/cartodb/wiki/CartoDB-Surrogate-Keys) headers to responses

Enhancements:
 - Use new `node-cartodb-query-tables` library to obtain affected tables in queries

Announcements:
 - Remove deprecated tools directory


## 2.26.3

Released 2016-03-03

Improvements:
 - Optimize overviews queries for efficient spatial filtering in PostgreSQL


## 2.26.2

Released 2016-02-25

Announcements:
 - Upgrades windshaft to [1.13.2](https://github.com/CartoDB/Windshaft/releases/tag/1.13.2)


## 2.26.1

Released 2016-02-24

Announcements:
 - Upgrades windshaft to [1.13.1](https://github.com/CartoDB/Windshaft/releases/tag/1.13.1)


## 2.26.0

Released 2016-02-24

Announcements:
 - Upgrades windshaft to [1.13.0](https://github.com/CartoDB/Windshaft/releases/tag/1.13.0)


## 2.25.2

Released 2016-02-22

Bug fixes:
 - Correct URLs for widgets in named maps #381


## 2.25.1

Released 2016-02-22

Announcements:
 - Upgrades windshaft to [1.11.1](https://github.com/CartoDB/Windshaft/releases/tag/1.11.1)


## 2.25.0

Released 2016-02-18

Announcements:
 - Upgrades windshaft to [1.11.0](https://github.com/CartoDB/Windshaft/releases/tag/1.11.0)


## 2.24.0

Released 2016-02-15

Announcements:
 - Upgrades windshaft to [1.10.1](https://github.com/CartoDB/Windshaft/releases/tag/1.10.1)


## 2.23.0

Released 2016-02-10

Improvements:
- Support for overviews


## 2.22.0

Released 2016-02-08

Announcements:
 - Upgrades windshaft to [1.8.3](https://github.com/CartoDB/Windshaft/releases/tag/1.8.3)


## 2.21.1

Released 2016-02-05

Bug fixes:
 - Added default config for geojson renderer


## 2.21.0

Released 2016-02-04

Announcements:
 - Upgrades windshaft to [1.8.2](https://github.com/CartoDB/Windshaft/releases/tag/1.8.2)


## 2.20.0

Released 2016-01-20

Bug fixes:
 - Change redis pool name to report with a valid statsd key #363

Improvements:
 - Query runner improvements #359

Unsupported:
 - Widgets endpoints
 - Layer filters

Note: API for unsupported list might change in the future, use at your own peril.


## 2.19.1

Released 2015-11-23

Announcements:
 - Upgrades windshaft to [1.6.1](https://github.com/CartoDB/Windshaft/releases/tag/1.6.1)


## 2.19.0

Released 2015-11-12

Announcements:
 - Upgrades windshaft to [1.6.0](https://github.com/CartoDB/Windshaft/releases/tag/1.6.0)

## 2.18.0

Released 2015-11-02

Announcements:
 - Upgrades windshaft to [1.5.0](https://github.com/CartoDB/Windshaft/releases/tag/1.5.0)


## 2.17.0

Released 2015-10-28

Announcements:
 - Upgrades windshaft to [1.4.0](https://github.com/CartoDB/Windshaft/releases/tag/1.4.0)


## 2.16.0

Released 2015-10-22

Announcements:
 - Upgrades windshaft to [1.2.0](https://github.com/CartoDB/Windshaft/releases/tag/1.2.0)


## 2.15.1

Released 2015-10-21

Announcements:
 - Upgrades windshaft to [1.1.1](https://github.com/CartoDB/Windshaft/releases/tag/1.1.1)


## 2.15.0

Released 2015-10-13

Announcements:
 - Fastly purging no longer uses soft-purge option
 - Upgrades windshaft to [1.1.0](https://github.com/CartoDB/Windshaft/releases/tag/1.1.0)
 - Upgrades fastly-purge to [1.0.1](https://github.com/CartoDB/node-fastly-purge/releases/tag/1.0.1)


## 2.14.1

Released 2015-09-30

Enhancements:
 - Remove app dependency from controllers

Announcements:
 - Upgrades windshaft to [1.0.1](https://github.com/CartoDB/Windshaft/releases/tag/1.0.1)

Improvements:
 - Safer user extraction from request Host header


## 2.14.0

Released 2015-09-30

Summary: this starts using Windshaft as library (aka version 1.0.0), it no longer extends old Windshaft server.

Announcements:
 - Upgrades windshaft to [1.0.0](https://github.com/CartoDB/Windshaft/releases/tag/1.0.0)

New features:
 - Named tiles: /api/v1/map/named/:name/:layer/:z/:x/:y.:format

Ported from Windshaft pre-library:
 - Almost all acceptance tests, some unit and some integration tests
 - Stats + profiler

New features:
 - Named maps MapConfig provider
 - Base controller with: req2params, send response/error mechanisms
 - Authentication/Authorization moves to its own API so it can be reused
 - Surrogate-Key headers for named maps and affected tables

Improvements:
 - No more fake requests to emulate map config instantiations
 - As named maps previews are using named map MapConfigProvider it doesn't need to load the MapConfig
 - Controllers using Windshaft's backends to request resources through MapConfig providers
 - Express 4.x, as Windshaft no longer provides an HTTP server, here we start using latest major version of Express.
 - assert.response implemented using request
 - All tests validate there are no unexpected keys in Redis and keys requested to be deleted after a test are present
 - Test suite in Makefile generated with `find`
 - Image comparison with `mapnik.Image.compare`
 - Doesn't emit Named map update event on unmodified templates

TODO:
  - Named map provider checks on every request if named map has changed to reload it (actually reset it so MapConfig has to be regenerated). See https://github.com/CartoDB/Windshaft-cartodb/commit/f553efa69e83fdf296154ab1b7b49aa08957c04e. This is done this way because when running the Service in a cluster there is no communication between different instances so when a named map gets updated in one of the them the rest is not aware/notified of the change. In the future there should be a mechanism to synch this changes between instance:
   * endpoint
   * redis pub/sub
   * backdoor


## 2.13.0

Released 2015-09-21

New features:
 - Keep x-cache-channel in named map static maps


## 2.12.0

Released 2015-08-27

Announcements:
 - Upgrades windshaft to [0.51.0](https://github.com/CartoDB/Windshaft/releases/tag/0.51.0)

New features:
 - Make http and https globalAgent options configurable
   * If config is not provided it configures them with default values


## 2.11.0

Released 2015-08-26

Announcements:
 - Upgrades windshaft to [0.50.0](https://github.com/CartoDB/Windshaft/releases/tag/0.50.0)


## 2.10.0

Released 2015-08-18

New features:
 - Exposes metatile cache configuration for tilelive-mapnik, see configuration sample files for more information.

Announcements:
 - Upgrades windshaft to [0.49.0](https://github.com/CartoDB/Windshaft/releases/tag/0.49.0)


## 2.9.0

Released 2015-08-06

New features:
 - Send memory usage stats


## 2.8.0

Released 2015-07-15

Announcements:
 - Upgrades windshaft to [0.48.0](https://github.com/CartoDB/Windshaft/releases/tag/0.48.0)


## 2.7.2

Released 2015-07-14

Enhancements:
 - Replaces `CDB_QueryTables` with `CDB_QueryTablesText` to avoid issues with long schema+table names


## 2.7.1

Released 2015-07-06

Bug fixes:
 - redis-mpool `noReadyCheck` and `unwatchOnRelease` options from config and defaulted


## 2.7.0

Released 2015-07-06

Announcements:
 - Upgrades windshaft to [0.47.0](https://github.com/CartoDB/Windshaft/releases/tag/0.47.0)
 - Upgrades redis-mpool to [0.4.0](https://github.com/CartoDB/node-redis-mpool/releases/tag/0.4.0)

New features:
 - Exposes redis `noReadyCheck` config

Bug fixes:
 - Fixes `unwatchOnRelease` redis config


## 2.6.1

Released 2015-07-02

Announcements:
 - Upgrades windshaft to [0.46.1](https://github.com/CartoDB/Windshaft/releases/tag/0.46.1)


## 2.6.0

Released 2015-07-02

Announcements:
 - Upgrades windshaft to [0.46.0](https://github.com/CartoDB/Windshaft/releases/tag/0.46.0)
 - New config to set metatile by format


## 2.5.0

Released 2015-06-18

New features:
 - Named maps names can start with numbers and can contain dashes (-).
 - Adds layergroupid header in map instantiations

Bug fixes:
 - Named maps error responses with `{ "errors": ["message"] }` format (#305)

Announcements:
 - Upgrades windshaft to [0.45.0](https://github.com/CartoDB/Windshaft/releases/tag/0.45.0)

Enhancements:
 - Fix documentation style and error examples


## 2.4.1

Released 2015-06-01

Announcements:
 - Upgrades windshaft to [0.44.1](https://github.com/CartoDB/Windshaft/releases/tag/0.44.1)


## 2.4.0

Released 2015-05-26

Announcements:
 - Upgrades windshaft to [0.44.0](https://github.com/CartoDB/Windshaft/releases/tag/0.44.0)


## 2.3.0

Released 2015-05-18

Announcements:
 - Upgrades cartodb-redis for `global` map stats


## 2.2.0

Released 2015-04-29

Enhancements:
 - jshint is run against tests
 - tests moved to mocha's `describe`

New features:
 - Fastly surrogate keys invalidation for named maps
   * **New configuration entry**: `fastly`. Check example configurations for more information.
 - `PgQueryRunner` extracted from `QueryTablesApi` so it can be reused in new `TablesExtentApi`
 - New top level element, `view`, in templates that holds attributes to identify the map scene.
 - Named maps static preview in /api/v1/map/static/named/:name/:width/:height.:format endpoint
   * It will be invalidated if the named map changes
   * But have a Cache-Control header with a 2 hours max-age, won't be invalidated on data changes


## 2.1.3

Released 2015-04-16

Announcements:
 - Upgrades windshaft to [0.42.2](https://github.com/CartoDB/Windshaft/releases/tag/0.42.2)


## 2.1.2

Released 2015-04-15

Bug fixes:
 - Do not check statsd_client in profiler

Announcements:
 - Upgrades windshaft to [0.42.1](https://github.com/CartoDB/Windshaft/releases/tag/0.42.1)


## 2.1.1

Released 2015-04-10

Bug fixes:
 - Do not add x-cache-channel header for GET template routes


## 2.1.0

Released 2015-04-09

Announcements:
 - Upgrades windshaft to [0.42.0](https://github.com/CartoDB/Windshaft/releases/tag/0.42.0)


## 2.0.0

Released 2015-04-08

Announcements:
 - Major release with **BREAKING CHANGES**:
  * Removes `/:table/infowindow`, `/:table/map_metadata` and `/:table/flush_cache` endpoints
  * Sample configuration removes `/tiles/template` and `/tiles/layergroup`
  * URLs to use from now on are: `/api/v1/map/named` and `/api/v1/map`
  * No more state changes for styles
  * No more dump stats for renderers: SIGUSR1 and SIGUSR2 signals
  * Removes query params:
    - sql
    - geom_type
    - cache_buster
    - cache_policy
    - interactivity
    - style
    - style_version
    - style_convert
    - scale_factor
  * Affected tables for x-cache-channel will use direct connection to postgresql
  * Removes some metrics: authorized times ones
  * Mapnik renderer configuration not part of the `renderer` root configuration
    - All configuration must be moved into `renderer.mapnik`, see `config/environments/*.js.example` for reference
 - Removes rollbar as optional logger


## 1.30.0

Released 2015-03-11

Announcements:
 - Upgrades windshaft to [0.40.0](https://github.com/CartoDB/Windshaft/releases/tag/0.40.0)


## 1.29.0

Released 2015-03-09

Announcements:
 - Upgrades windshaft to [0.39.0](https://github.com/CartoDB/Windshaft/releases/tag/0.39.0)


## 1.28.5

Released 2015-02-20

Announcements:
- Upgrades windshaft to [0.37.5](https://github.com/CartoDB/Windshaft/releases/tag/0.37.5)


## 1.28.4

Released 2015-02-18

Announcements:
- Upgrades windshaft to [0.37.4](https://github.com/CartoDB/Windshaft/releases/tag/0.37.4)


## 1.28.3

Released 2015-02-17

Announcements:
- Upgrades windshaft to [0.37.3](https://github.com/CartoDB/Windshaft/releases/tag/0.37.3)


## 1.28.2

Released 2015-02-17

Announcements:
- Upgrades windshaft to [0.37.2](https://github.com/CartoDB/Windshaft/releases/tag/0.37.2)


## 1.28.1

Released 2015-02-17

Announcements:
- Upgrades windshaft to [0.37.1](https://github.com/CartoDB/Windshaft/releases/tag/0.37.1)


## 1.28.0

Released 2015-02-17

Announcements:
- Upgrades windshaft to [0.37.0](https://github.com/CartoDB/Windshaft/releases/tag/0.37.0)

New features:
 - QueryTablesApi will always use an authenticated query to retrieve last update, this allows to query affected private
 tables last update (#253)


## 1.27.0

Released 2015-02-16

Announcements:
- Adds default image placeholder for http renderer to use as fallback

New features:
- `named` layers type, see [MapConfig-NamedMaps-extension](docs/MapConfig-NamedMaps-extension.md)
  - Starts using datasource per layer feature from Windshaft ([2c7bc6a](https://github.com/CartoDB/Windshaft-cartodb/commit/2c7bc6adde561b20ed955b905e3c7bcd6795d128))

Bugfixes:
- Fixes tests with beforeEach and afterEach triggers


## 1.26.2

Released 2015-01-28

Bugfixes:
 - Accept 'open' string in templates' `auth` as authorized.


## 1.26.1

Released 2015-01-28

Announcements:
 - Upgrades windshaft to 0.35.1, see https://github.com/CartoDB/Windshaft/pull/254


## 1.26.0

Released 2015-01-27

Announcements:
 - Upgrades windshaft to 0.35.0, supports mapconfig version `1.3.0`


## 1.25.0

Released 2015-01-26

Announcements:
 - No more signed maps (#227 and #238)
    - Splits template maps endpoint into its own controller
    - Removes TemplateMaps dependency on SignedMaps
     - Token validation is done against the template
     - Template is always extended with default values for auth and placeholders
     - MapConfig is extended, in order to validate auth_tokens, with template info:
        - template name
        - template auth
     - No more locks to create, update or delete templates
        - Trusting in redis' hash semantics
        - Some tradeoffs:
            * A client having more templates than allowed by a race condition between limit (HLEN) check and creation (HSET)
            * Updating a template could happen while deleting it, resulting in a new template
            * Templates already instantiated will be accessible through their layergroup so it is possible to continue requesting tiles/grids/etc.
     - Authorisation is now handled by template maps
    - Template instantiation returns new instances with default values if they are missing


New features:
 - Basic layergroup validation on named map creation/update (#196)
 - Add named maps surrogate keys and call invalidation on template modification/deletion (#247)
    - Extends TemplateMaps backend with EventEmitter
        - Emits for create, update and delete templates
    - VarnishHttpCacheBackend will invalidate a varnish instance via HTTP PURGE method
        - In the future there could be more backends, for instance to invalidate a CDN.
    - NamedMapsEntry has the responsibility to generate a cache key for a named map
        - It probably should receive a template/named map instead of owner and template name
    - SurrogateKeysCache is responsible to tag responses with a header
        - It also is responsible for invalidations given an Invalidation Backend
        - In the future it could have several backends so it can invalidates different caches
    - SurrogateKeysCache is subscribed to TemplateMaps events to do the invalidations


## 1.24.0

Released 2015-01-15

Announcements:
 - Upgrades windshaft to 0.34.0 for retina support


## 1.23.1

Released 2015-01-14

Announcements:
 - Regenerate npm-shrinkwrap.json


## 1.23.0

Released 2015-01-14

Announcements:
 - Upgrades windshaft to 0.33.0

New features:
 - Sets HTTP renderer configuration in server_options


## 1.22.0

Released 2015-01-13

New features:
 - Health check endpoint


## 1.21.2

Released 2014-12-15

Announcements:
 - Upgrades windshaft to 0.32.4


## 1.21.1

Released 2014-12-11

Announcements:
 - Upgrades windshaft to 0.32.2

Bugfixes:
 - Closes fd for log files on `kill -HUP` (#230)



## 1.21.0

Released 2014-10-24

New features:
 - Allow a different cache-control max-age for layergroup responses


## 1.20.2

Released 2014-10-20

Announcements:
 - Upgrades windshaft to 0.31.0


## 1.20.1

Released 2014-10-17

Announcements:
 - Upgrades redis-mpool to 0.3.0


## 1.20.0

Released 2014-10-15

New features:
 - Report to statsd the status of redis pools
 - Upgrades Windshaft to start reporting redis/renderers/mapnik pool metrics

Enhancements:
 - Share one redis-mpool across the application


## 1.19.0

Released 2014-10-14

Announcements:
 - Dropping support for npm <1.2.1
   npm-shrinkwrap.json is incompatible when generated with npm >=1.2.1 and consumed by npm <1.2.1
 - Upgrades windshaft to 0.28.2
 - Generates npm-shrinkwrap.json with npm >1.2.0


## 1.18.2

Released 2014-10-13

Bug fixes:
 - Defaults resultSet to object if undefined in QueryTablesApi

Announcements:
 - Upgrades windshaft to 0.28.1


## 1.18.1

Released 2014-10-13

New features:
 - Allow to add more node.js' threadpool workers via process.env.UV_THREADPOOL_SIZE


## 1.18.0

Released 2014-10-03

Announcements:
 - Comes back to use mapnik 2.3.x based on cartodb/node-mapnik@1.4.15-cdb from windshaft@0.28.0


## 1.17.2

Released 2014-10-01

Announcements:
 - Upgrades windshaft to 0.27.2 which downgrades node-mapnik to 0.7.26-cdb1


## 1.17.1

Released 2014-09-30

Announcements:
 - Upgrades windshaft to 0.27.1 which downgrades node-mapnik to 1.4.10

Enhancements:
 - TTL for template locks so they are not kept forever
 - Upgrades mocha


## 1.17.0

Released 2014-09-25

New features:
 - Starts using mapnik 2.3.x

Enhancements:
 - Upgrades windshaft and cartodb-redis
 - Supports `!scale_denominator!` dynamic param in SQL queries
 - Metrics revamp: removes and adds some metrics
 - Adds poolSize configuration for mapnik

## 1.16.1

Released 2014-08-19

Enhancements:
 - Upgrades cartodb-redis

## 1.16.0

Released 2014-08-18

New features:
 - Configurable QueryTablesAPI to call directly postgresql using cartodb-psql
   or to keep using a request to the SQL API

Enhancements:
 - Removes mapnik dependency as it now relies on Windshaft to check mapnik version
 - Upgrades dependencies:
    - underscore
    - lzma
    - log4js
    - rollbar
    - windshaft
    - request

## 1.15.0

Released 2014-08-13
Enhancements:
 - Upgrades dependencies:
    - redis-mpool
    - cartodb-redis
    - windshaft
 - Specifies name in the redis pool
 - Slow pool configuration in example configurations


## 1.14.0

Released 2014-08-07

Enhancements:
 - SQL API requests moved to its own entity

New features:
 - Affected tables and last updated time for a query are performed in a single
   request to the SQL API
 - Allow specifying the tile format, upgrades windshaft and grainstore
   dependencies for this matter


## 1.13.1

Released 2014-08-04

Enhancements:
 - Profiler header sent as JSON string


## 1.13.0

Released 2014-07-30

New features:
 - Support for postgresql schemas
 - Use public user from redis
 - Support for several auth tokens

## 1.12.1

Released 2014-06-24

Enhancements:
 - Caches layergroup and sets X-Cache-Channel in GET requests also in named maps

## 1.12.0

Released 2014-06-24

New features:
 - Caches layergroup and sets X-Cache-Channel in GET requests

## 1.11.1

Released 2014-05-07

Enhancements:

 - Upgrade Windshaft to 0.21.0, see
 http://github.com/CartoDB/Windshaft/blob/0.21.0/NEWS

## 1.11.0

Released 2014-04-28

New features:

 - Add support for log_filename directive
 - Reopen log file on SIGHUP, for better logrotate integration

Enhancements:

 - Set default PostgreSQL application name to "cartodb_tiler"

## 1.10.2

Released 2014-04-08

Bug fixes:

 - Fix show_style tool broken since 1.8.1
 - Fix X-Cache-Channel of tiles accessed via signed token (#188)

## 1.10.1

Released 2014-03-21

Bug fixes:

 - Do not cache non-success jsonp responses (#186)

## 1.10.0

Released 2014-03-20

New features:

 - Add optional support for rollbar (#150)

Enhancements:

 - Do not send connection details to client (#183)
 - Upgrade node-varnish to 0.3.0
 - Upgrade Windshaft to 0.20.0, see
   http://github.com/CartoDB/Windshaft/blob/0.20.0/NEWS
 - Include tiler version in startup log
 - Install an uncaught exception handler
 - Require own fork of node-mapnik, with temptative fix
   for libxml usage (glibc detected corruptions)

Other changes:

 - Switch to 3-clause BSD license (#184)

## 1.9.0

Released 2014-03-10

New features:

 - Allow to set server related configuration in serverMetadata (#182)

## 1.8.5

Released 2014-03-10

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

## 1.8.4

Released 2014-03-03

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

## 1.8.3

Released 2014-02-27

Enhancements:

 - Upgrades windshaft to 0.19.1 with many performance improvements,
   See node_modules/windshaft/NEWS
 - Improve speed of instanciating a map (#147, #159, #165)
 - Give meaningful error on attempts to use map tokens
   with attribute service (#156)
 - Reduce sql-api communication timeout, and allow overriding (#167)
   [ new sqlapi.timeout directive, defaults to 100 ms ]
 - Do not query CDB_TableMetadata for queries affected by no tables (#168)

## 1.8.2

Released 2014-02-25

Enhancements:

 * Allow using ":host" as part of statsd.prefix (#153)
 * Expand "addCacheChannel" stats
 * Allow using GET with sql-api for queries shorter than configured len (#155)
   [ new sqlapi.max_get_sql_length directive, defaults to 2048 ]
 * Do not log an error for a legit request requiring no X-Cache-Channel

Bug fixes:

 * Fix munin plugin after log format changes (#154)

## 1.8.1

Released 2014-02-19

Enhancements:

 * Use log4js logger (#138)

Bug fixes:

 * Always generate X-Cache-Channel for token-based tile responses (#152)

## 1.8.0

Released 2014-02-18

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

## 1.7.1

Released 2014-02-11

Enhancements:

 * Disable debug logging unless "debug" config param evaluates to true (#137)
 * Require windshaft 0.17.2 for further reducing log noise (#137)

## 1.7.0

Released 2014-02-11

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


## 1.6.3

Released 2014-01-30

Bug fixes:

* layergroup accept both map_key and api_key (#91)
* Fix public instanciation of signed template accessing private data (#114)
* Fix show_style in presence of complex styles
* Fix use of maxzoom in layergroup config (via windshaft-0.15.1)

Enhancements:

* Add support for instanciating a template map with JSONP (#116)
* Stop processing XML on renderer creation, not needed anymore since 1.6.1
  introduced on-demand XML generation.

## 1.6.2

Released 2014-01-23

Bug fixes:

* Fix support for long (>64k chars) queries in layergroup creation (#111)

Enhancements:

* Enhance tools/show_style to accept an environment parameter and
  print XML style now it is not in redis anymore (#110)
* Support CORS in template instanciation endpoint (#113)

## 1.6.1

Released 2014-01-15

Bug fixes:

* Drop cache headers from error responses (#107)
* Localize external CartoCSS resources at renderer creation time (#108)

## 1.6.0

Released 2014-01-10

New features:

 * Add 'user_from_host' directive to generalize username extraction (#100)
 * Implement signed template maps (#98)


Other changes:

 * Update cartodb-redis dependency to "~0.3.0"
 * Update redis-server dependency to "2.4.0+"

## 1.5.2

Released 2013-12-05

Bug fixes:

* Fix configuration-level compatibility with versions prior to 1.5 (#96)
* Fix use of old layergroups on mapnik upgrade (#97)

## 1.5.1

Released 2013-11-28

Bug fixes:

* Survive presence of malformed CartoCSS in redis (#94)
* Accept useless point-transform:scale directives (#93)

## 1.5.0

Released 2013-11-19

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


## 1.4.1

Released 2013-11-08

* Fix support for exponential notation in CartoCSS filter values (#87)

## 1.4.0

Released 2013-10-31

* Add Support for Mapnik-2.2.0 (#78)

## 1.3.6

Released 2013-10-11

* Restore support for node-0.8.9 accidentally dropped by 1.3.5
  NOTE: needs removing node_modules/windshaft and re-running npm install

## 1.3.5

Released 2013-10-03

* Fixing apostrophes in CartoCSS
* Fix "sql/table must contain zoom variable" error when using
  "[ zoom > 3]" CartoCSS snippets (note the space)
* Fix backward compatibility handling of sqlapi.host configuration (#82)
* Fix error for invalid text-name in CartoCSS (#81)
* Do not let anonymous requests use authorized renderer caches

## 1.3.4


NOTE: configuration sqlapi.host renamed to sqlapi.domain
      (support for "sqlapi.host" is retained for backward compatibility)

* Improve empty CartoCSS error message
* Improve invalid mapnik-geometry-type CSS error message
* Fix race condition in localization of network resources

## 1.3.3

* Set Last-Modified header to allow for 304 responses
* Add profiling support (needs useProfiler in env config file)
* Fix double-checking for layergroups with no interactivity
* Log full layergroup config at creation time (#76)

## 1.3.2

* Set default layergroup TTL to 2 hours
* Serve multilayer tiles and grid with persistent cache control

## 1.3.1

* Fix deadlock on new style creation
* Fix database authentication with multi-table layergroups
* Add tile and grid fetching checks at layergroup creation time
* Fix SQL error reporting to NOT split on newline
* Fix support for CartoCSS attachments

## 1.3.0

* Change stats format for multilayer map token request, see
  http://github.com/Vizzuality/Windshaft-cartodb/wiki/Redis-stats-format

## 1.2.1

* Fix multilayer post from firefox
* Fix multilayer cartocss layer name handling

## 1.2.0

* Multilayer API changes
  * Layers passed by index in grid fetching url
  * Interactivity only specified in layergroup config
  * Embed cache_buster within token
  * Use ISO format for last_modified timestamp
* Expected LZMA encoding changed to base64

## 1.1.10

* Fix regression with default interactivity parameter (#74)
* More verbose logging for SQL api connection errors
* Write stats for multilayer map token request

## 1.1.9

* Handle SQL API errors by requesting no Varnish cache
* Fix X-Cache-Channel for multilayer (by token) responses
* Add last_modified field to layergroup creation response (#72)
* Deprecate signal handler for USR1, add handler for USR2 (#71)
* Fix support for ampersend characters in CartoCSS
* Add support for LZMA compressed GET parameters
* Add support for creating layergroups via GET

## 1.1.8

* Require Windshaft-0.9.1, to reduce harmfulness of cache_buster param

## 1.1.7

Released DD//MM//YY

* Do not let /etc/services confuse FD checker (munin plugin)
* Multilayer support (#72)
* Expose renderer settings in the environment config files

## 1.1.6

Released 19//02//13

* Require windshaft 0.8.5, fixing some stability issues
  and providing cache info on request
* Require grainstore 0.10.9, fixing an issue with multi-geom markers
* Enhance run_tests.sh to allow running single tests and skipping preparation
* Fix async throws in getGeometryType, getInfoWindow and getMapMetadata
* Survive connection refusals from redis
* Add maxConnection environment configuration, default to 128

## 1.1.5

Released DD//MM//YY

* Fix bogus cached return of utf grid for fully contained tiles (#67)

## 1.1.4

Released DD//MM//YY

* Reduce default extent to allow for consistent proj4 round-tripping
* Enhance reset_styles script to use full configuration (#62)
* Have reset_styles script also drop extended keys (#58)
* Fix example postgis parameter for simplifying input geoms (#63)
* Add row_limit to example config (#64)

## 1.1.3

Released 30//11//12

* Fix reset_styles script to really skip extended keys
* CartoCSS versioning
 * Mapnik-version dependent default styles
 * Enhance 2.0 -> 2.1 transforms:
  * styles with conditional markers
  * scale arrow markers by 50%

## 1.1.2

Released DD//MM//YY

* CartoCSS versioning
 * Fix use of "style_version" with GET (inline styles)
 * Enhance 2.0 -> 2.1 transforms:
  * styles with no semicolon
  * markers shift due to geometry clipping

## 1.1.1

Released DD//MM//YY

* Add support for persistent client cache headers
* Fix crash on unknown user (#55)
* Add /version entry point
* CartoCSS versioning
 * Include style_version in GET /style response
 * Support style_version and style_convert parameters in POST /style request
 * Support style_version in GET /:z/:x/:y request

## 1.1.0

Released (30/10/12)

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

## 1.0.0

Released 03/10/12

* Migrated to node 0.8.x.

## 0.9.0

Released 25/09/12

* External resources in CartoCSS
* Added X-Cache-Channel header in all the tiler GET requests
* Small fixes
