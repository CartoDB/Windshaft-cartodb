# Installing Windshaft-CartoDB #

## Requirements ##
Make sure that you have the requirements needed. These are

- Core
  - Node >= 10
  - npm >= 6
  - gcc == 4.9
  - PostgreSQL >= 9.5
  - PostGIS >= 2.2
  - CartoDB Postgres Extension == 0.24.1
  - Redis >= 4
  - Mapnik == 3.0.15.9. See [Installing Mapnik](https://github.com/CartoDB/Windshaft#installing-mapnik).
  - Windshaft: check [Windshaft dependencies and installation notes](https://github.com/CartoDB/Windshaft#dependencies)
  - libcairo2-dev, libpango1.0-dev, libjpeg8-dev and libgif-dev for server side canvas support

- For cache control
  - Varnish (http://www.varnish-cache.org)

## PostGIS setup

A `template_postgis` database is expected. One can be set up with

```shell
createdb --owner postgres --template template0 template_postgis
psql -d template_postgis -c 'CREATE EXTENSION postgis;'
```

## Build/install

To fetch and build all node-based dependencies, run:

```shell
npm install
```

Note that the  ```npm``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```npm``` again.
