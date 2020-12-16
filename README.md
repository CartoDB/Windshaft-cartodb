# Windshaft-CartoDB [![Build Status](https://travis-ci.org/CartoDB/Windshaft-cartodb.svg?branch=master)](https://travis-ci.org/CartoDB/Windshaft-cartodb)

The [`CARTO Maps API`](https://carto.com/developers/maps-api/) tiler. It extends [`Windshaft`](https://github.com/CartoDB/Windshaft) and exposes a web service with extra functionality:

* Instantiate [`Anonymous Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/03-anonymous-maps.md) through CARTO's map configuration ([`MapConfig`](https://github.com/CartoDB/Windshaft/blob/master/doc/MapConfig-specification.md)).
* Create [`Named Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/04-named-maps.md) based on customizable templates.
* Get map previews through [`Static Maps`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/05-static-maps-API.md) API.
* Render maps with a large amount of data faster using [`Tile Aggregation`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/06-tile-aggregation.md).
* Build advanced maps with enriched data through [`Analyses Extension`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/09-MapConfig-analyses-extension.md).
* Fetch tabular data from analysis nodes with [`Dataviews`](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docs/guides/10-MapConfig-dataviews-extension.md)

## Build

Requirements:

* [`Node 12.x `](https://nodejs.org/dist/latest-v10.x/)
* [`PostgreSQL >= 11.0`](https://www.postgresql.org/download/)
* [`PostGIS >= 2.4`](https://postgis.net/install/)
* [`CARTO Postgres Extension >= 0.24.1`](https://github.com/CartoDB/cartodb-postgresql)
* [`Redis >= 4`](https://redis.io/download)
* `libcairo2-dev`, `libpango1.0-dev`, `libjpeg8-dev` and `libgif-dev` for server side canvas support
* `C++11` to build internal dependencies. When there's no pre-built binaries for your OS/architecture distribution.

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
$ npm install
```

### Run

You can inject the configuration through environment variables at run time. Check the file `./config/environments/config.js` to see the ones you have available.

While the migration to the new environment based configuration, you can still use the old method of copying a config file. To enabled the one with environment variables you need to pass `CARTO_WINDSHAFT_ENV_BASED_CONF=true`. You can use the docker image to run it.

Old way:

```shell
$ node app.js <env>
```

Where `<env>` is the name of a configuration file under `./config/environments/`.

### Test

You can easily run the tests against the dependencies from the `dev-env`. To do so, you need to build the test docker image:

```shell
$ docker-compose build
```

Then you can run the tests like:

```shell
$ docker-compose run windshaft-tests
```

It will mount your code inside a volume. In case you want to play and run `npm test` or something else you can do:

```shell
$ docker-compose run --entrypoint bash windshaft-tests
```

So you will have a bash shell inside the test container, with the code from your host.

### Coverage

```shell
$ npm run cover
```

Open `./coverage/lcov-report/index.html`.

### Docker support

We provide docker images just for testing and continuous integration purposes:

* [`nodejs-xenial-pg1121`](https://hub.docker.com/r/carto/nodejs-xenial-pg1121/tags)
* [`nodejs-xenial-pg101`](https://hub.docker.com/r/carto/nodejs-xenial-pg101/tags)

You can find instructions to install Docker, download, and update images [here](https://github.com/CartoDB/Windshaft-cartodb/blob/master/docker/reference.md).

### Useful `npm` scripts

Run test in a docker image with a specific Node.js version:

```shell
$ DOCKER_IMAGE=<docker-image-tag> NODE_VERSION=<nodejs-version> npm run test:docker
```

Where:

* `<docker-image-tag>`: the tag of required docker image, e.g. `carto/nodejs-xenial-pg1121:latest`
* `<nodejs-version>`: the Node.js version, e.g. `10.15.1`

In case you need to debug:

```shell
$ DOCKER_IMAGE=<docker-image-tag> npm run docker:bash
```

## Documentation

You can find an overview, guides, full reference, and support in [`CARTO's developer center`](https://carto.com/developers/maps-api/). The [docs directory](https://github.com/CartoDB/Windshaft-cartodb/tree/master/docs) contains different documentation resources, from a higher level to more detailed ones.

## Contributing

* The issue tracker: [`Github`](https://github.com/CartoDB/Windshaft-cartodb/issues).
* We love Pull Requests from everyone, see [contributing to Open Source on GitHub](https://guides.github.com/activities/contributing-to-open-source/#contributing).
* You'll need to sign a Contributor License Agreement (CLA) before submitting a Pull Request. [Learn more here](https://carto.com/contributions).

## Developing with a custom `Windshaft` version

If you plan or want to use a custom / not released yet version of windshaft (or any other dependency), the best option is to use `npm link`. You can read more about it at `npm-link`: [symlink a package folder](https://docs.npmjs.com/cli/link.html).

```shell
$ cd /path/to/Windshaft
$ npm install
$ npm link
$ cd /path/to/Windshaft-cartodb
$ npm link windshaft
```

## Versioning

We follow [`SemVer`](http://semver.org/) for versioning. For available versions, see the [tags on this repository](https://github.com/CartoDB/Windshaft-cartodb/tags).

## License

This project is licensed under the BSD 3-clause "New" or "Revised" License. See the [LICENSE](LICENSE) file for details.
