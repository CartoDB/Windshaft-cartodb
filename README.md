Windshaft-CartoDB
==================

[![Build Status](https://travis-ci.org/CartoDB/Windshaft-cartodb.svg?branch=master)](https://travis-ci.org/CartoDB/Windshaft-cartodb)

This is the [CartoDB Maps API](http://docs.cartodb.com/cartodb-platform/maps-api.html) tiler. It extends
[Windshaft](https://github.com/CartoDB/Windshaft) with some extra functionality and custom filters for authentication.

* reads dbname from subdomain and cartodb redis for pretty tile urls
* configures windshaft to publish `cartodb_id` as the interactivity layer
* gets the default geometry type from the cartodb redis store
* allows tiles to be styled individually
* provides a link to varnish high speed cache
* provides a [template maps API](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/Template-maps.md)

Requirements
------------
 - Core
   - Node.js >=0.8
   - npm >=1.2.1
   - PostgreSQL >8.3.x, PostGIS >1.5.x
   - Redis >2.4.0 (http://www.redis.io)
   - Mapnik 2.0.1, 2.0.2, 2.1.0, 2.2.0, 2.3.0. See Installing Mapnik.
   - Windshaft: check [Windshaft dependencies and installation notes](https://github.com/CartoDB/Windshaft#dependencies)
   - libcairo2-dev, libpango1.0-dev, libjpeg8-dev and libgif-dev for server side canvas support

- For cache control (optional)
   - CartoDB 0.9.5+ (for `CDB_QueryTables`)
   - Varnish (http://www.varnish-cache.org)

- For running the testsuite
   - ImageMagick (http://www.imagemagick.org)

Configure
---------

Create the config/environments/<env>.js files (there are .example files
to start from). You can optionally use the ./configure script for this,
see ```./configure --help``` to see available options.

Look at lib/cartodb/server_options.js for more on config

Build/install
-------------

To fetch and build all node-based dependencies, run:

```
git clone
npm install
```

Note that the ```npm install``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```npm install``` again.

Upgrading
---------

Checkout your commit/branch. If you need to reinstall dependencies (you can check [NEWS](NEWS.md)) do the following:

```
rm -rf node_modules; npm install
```

Run
---

```
node app.js <env> 
```

Where <env> is the name of a configuration file under config/environments/.

Note that caches are kept in redis. If you're not seeing what you expect
there may be out-of-sync records in there.
Take a look: http://redis.io/commands


Documentation
-------------

The [docs directory](https://github.com/CartoDB/Windshaft-cartodb/tree/master/docs) contains different documentation
resources, from higher level to more detailed ones:
The [Maps API](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/Map-API.md) defined the endpoints and their
expected parameters and outputs.


Examples
--------

[CartoDB's Map Gallery](http://cartodb.com/gallery/) showcases several examples of visualisations built on top of this.


Contributing
---

See [CONTRIBUTING.md](CONTRIBUTING.md).
