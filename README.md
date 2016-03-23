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

Install
-------
See [INSTALL.md](INSTALL.md) for detailed installation instructions.

Configure
---------

Create the config/environments/<env>.js files (there are .example files
to start from). You can optionally use the ./configure script for this,
see ```./configure --help``` to see available options.

Look at lib/cartodb/server_options.js for more on config

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

### Developing with a custom windshaft version

If you plan or want to use a custom / not released yet version of windshaft (or any other dependency) the best option is
to use `npm link`. You can read more about it at [npm-link: Symlink a package folder](https://docs.npmjs.com/cli/link).

**Quick start**:

```shell
~/windshaft-directory $ npm install
~/windshaft-directory $ npm link
~/windshaft-cartodb-directory $ npm link windshaft
```
