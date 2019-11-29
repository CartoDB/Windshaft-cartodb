# Windshaft-CartoDB [![Build Status](https://travis-ci.org/CartoDB/Windshaft-cartodb.svg?branch=master)](https://travis-ci.org/CartoDB/Windshaft-cartodb)

This is the [`CARTO Maps API`](http://docs.cartodb.com/cartodb-platform/maps-api.html) tiler. It extends [`Windshaft`](https://github.com/CartoDB/Windshaft) and exposes a complete web service with extra functionality:

* Instantiate [`Anonymous Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/03-anonymous-maps.md) through CARTO's map configuration ([`MapConfig`](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-specification.md)).
* Create [`Named Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/04-named-maps.md) based on customizables templates.
* Get map previews through [`Static Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/05-static-maps-API.md) API.
* Render maps with large amount of data faster using [`Tile Aggregation`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/06-tile-aggregation.md).
* Build advanced maps with enriched data through [`Analyses Extension`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/09-MapConfig-analyses-extension.md).
* Fetch tabular data from analysis nodes with [`Dataviews`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/10-MapConfig-dataviews-extension.md)

## Build

Requirements:

* Node 10.x
* npm 6.x
* PostgreSQL >= 10.0
* PostGIS >= 2.4
* CARTO Postgres Extension >= 0.24.1
* Redis >= 4
* libcairo2-dev, libpango1.0-dev, libjpeg8-dev and libgif-dev for server side canvas support
* C++11 (to build internal dependencies if needed)

Optional:

* [`Varnish`](http://www.varnish-cache.org)
* [`Statsd`](https://github.com/statsd/statsd)

### PostGIS setup

A `template_postgis` database is expected. One can be set up with

```shell
$ createdb --owner postgres --template template0 template_postgis
$ psql -d template_postgis -c 'CREATE EXTENSION postgis;'
```

### Install

To fetch and build all node-based dependencies, run:

```shell
$ npm ci
```

### Run

Create the `./config/environments/<env>.js` file (there are `.example` files to start from). Look at `./lib/cartodb/server-options.js` for more on config.

```shell
$ node app.js <env>
```

Where `<env>` is the name of a configuration file under `./config/environments/`.

## Documentation

You can find an overview, guides, full reference, and support in [`CARTO's developer center`](https://carto.com/developers/maps-api/). The [docs directory](https://github.com/CartoDB/Windshaft-cartodb/tree/master/docs) contains different documentation resources, from higher level to more detailed ones.

## Contributing

* The issue tracker: [`Github`](https://github.com/CartoDB/Windshaft-cartodb/issues).
* We love pull requests from everyone, see [contributing to Open Source on GitHub](https://guides.github.com/activities/contributing-to-open-source/#contributing).
* You'll need to sign a Contributor License Agreement (CLA) before making a submission. [Learn more here](https://carto.com/contributions).

## Developing with a custom windshaft version

If you plan or want to use a custom / not released yet version of windshaft (or any other dependency) the best option is to use `npm link`. You can read more about it at `npm-link`: [symlink a package folder](https://docs.npmjs.com/cli/link.html).

```shell
$ cd /path/to/Windshaft
$ npm install
$ npm link
$ cd /path/to/Windshaft-cartodb
$ npm link windshaft
```

## Versioning

We follow [`SemVer`](http://semver.org/) for versioning. For the versions available, see the [tags on this repository](https://github.com/Windshaft-cartodb/cartonik/tags).

## License

This project is licensed under the BSD 3-clause "New" or "Revised" License - see the [LICENSE](LICENSE) file for details.
