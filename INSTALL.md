# Installing Windshaft-CartoDB #

## Requirements ##
Make sure that you have the requirements needed. These are

- Core
  - Node.js >=6.9.x
  - yarn >=0.27.5
  - PostgreSQL >8.3.x, PostGIS >1.5.x
  - Redis >2.4.0 (http://www.redis.io)
  - Mapnik >3.x. See [Installing Mapnik](https://github.com/CartoDB/Windshaft#installing-mapnik).
  - Windshaft: check [Windshaft dependencies and installation notes](https://github.com/CartoDB/Windshaft#dependencies)
  - libcairo2-dev, libpango1.0-dev, libjpeg8-dev and libgif-dev for server side canvas support

- For cache control (optional)
  - CartoDB 0.9.5+ (for `CDB_QueryTables`)
  - Varnish (http://www.varnish-cache.org)

On Ubuntu 14.04 the dependencies can be installed with

```shell
sudo apt-get update
sudo apt-get install -y make g++ pkg-config git-core \
  libgif-dev libjpeg-dev libcairo2-dev \
  libhiredis-dev redis-server \
  nodejs nodejs-legacy npm \
  postgresql-9.3-postgis-2.1 postgresql-plpython-9.3 postgresql-server-dev-9.3
```

On Ubuntu 12.04 the [cartodb/cairo PPA](https://launchpad.net/~cartodb/+archive/ubuntu/cairo) may be useful.

## PostGIS setup ##

A `template_postgis` database is expected. One can be set up with

```shell
createdb --owner postgres --template template0 template_postgis
psql -d template_postgis -c 'CREATE EXTENSION postgis;'
```

## Build/install ##

To fetch and build all node-based dependencies, run:

```
yarn
```

Note that the ```yarn``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```yarn``` again.
