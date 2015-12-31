# Installing Windshaft-CartoDB #

## Requirements ##
Make sure that you have the requirements needed. These are

- Core
  - Node.js >=0.8
  - npm >=1.2.1 <2.0.0
  - PostgreSQL >8.3.x, PostGIS >1.5.x
  - Redis >2.4.0 (http://www.redis.io)
  - Mapnik 2.0.1, 2.0.2, 2.1.0, 2.2.0, 2.3.0. See [Installing Mapnik](https://github.com/CartoDB/Windshaft#installing-mapnik).
  - Windshaft: check [Windshaft dependencies and installation notes](https://github.com/CartoDB/Windshaft#dependencies)
  - libcairo2-dev, libpango1.0-dev, libjpeg8-dev and libgif-dev for server side canvas support

- For cache control (optional)
  - CartoDB 0.9.5+ (for `CDB_QueryTables`)
  - Varnish (http://www.varnish-cache.org)

- For running the testsuite
  - ImageMagick (http://www.imagemagick.org)


Dependencies installation example:

  ```shell
  sudo add-apt-repository -y ppa:cartodb/cairo
  sudo apt-get update
  sudo apt-get install -y build-essential checkinstall pkg-config libcairo2-dev libjpeg8-dev libgif-dev
  ```

## Build/install ##

To fetch and build all node-based dependencies, run:

```
npm install
```

Note that the ```npm install``` step will populate the node_modules/
directory with modules, some of which being compiled on demand. If you
happen to have startup errors you may need to force rebuilding those
modules. At any time just wipe out the node_modules/ directory and run
```npm install``` again.
