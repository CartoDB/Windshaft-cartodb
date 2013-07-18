var config = {
     environment: 'development'
    ,port: 8181
    ,host: '127.0.0.1'
    // Maximum number of connections for one process
    // 128 is a good value with a limit of 1024 open file descriptors
    ,maxConnections:128
    // idle socket timeout, in miliseconds 
    ,socket_timeout: 600000
    ,enable_cors: true
    ,cache_enabled: false
    ,log_format: '[:date] :req[X-Real-IP] :method :req[Host]:url :status :response-time ms -> :res[Content-Type] (:res[X-Tiler-Profiler])'
    ,postgres_auth_user: 'development_cartodb_user_<%= user_id %>'
    ,postgres: {
        // Parameters to pass to datasource plugin of mapnik
        // See http://github.com/mapnik/mapnik/wiki/PostGIS
        type: "postgis",
        user: "publicuser",
        host: '127.0.0.1',
        port: 5432,
        extent: "-20037508.3,-20037508.3,20037508.3,20037508.3",
        /* experimental
        geometry_field: "the_geom",
        extent: "-180,-90,180,90",
        srid: 4326,
        */
        row_limit: 65535,
        simplify_geometries: true,
        max_size: 500
    }
    ,mapnik_version: undefined
    ,renderer: {
      // Milliseconds since last access before renderer cache item expires
      cache_ttl: 60000,
      metatile: 4,
      bufferSize: 64
    }
    ,millstone: {
        cache_basedir: '/tmp/cdb-tiler-dev/millstone-dev'
    }
    ,redis: {
        host: '127.0.0.1',
        port: 6379,
        // Max number of connections in each pool.
        // Users will be put on a queue when the limit is hit.
        // Set to maxConnection to have no possible queues.
        // There are currently 3 pools involved in serving
        // windshaft-cartodb requests so multiply this number
        // by 3 to know how many possible connections will be
        // kept open by the server. The default is 50.
        max: 50,
        idleTimeoutMillis: 1, // idle time before dropping connection
        reapIntervalMillis: 1 // time between cleanups
    }
    ,sqlapi: {
        protocol: 'http',
        host: 'localhost.lan',
        port: 8080,
        version: 'v1'
    }
    ,varnish: {
        host: 'localhost',
        port: 6082,
        ttl: 86400
    }
    // If useProfiler is true every response will be served with an
    // X-Tiler-Profile header containing elapsed timing for various 
    // steps taken for producing the response.
    ,useProfiler:true
};

module.exports = config;
