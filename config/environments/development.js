var config = {
     environment: 'development'
    ,port: 8181
    ,host: '127.0.0.1'
    ,enable_cors: true
    ,cache_enabled: false
    ,postgres_auth_user: 'development_cartodb_user_<%= user_id %>'
    ,postgres: {
        type: "postgis",
        user: "publicuser",
        host: '127.0.0.1',
        port: 5432,
        extent: "-20005048.4188,-20005048.4188,20005048.4188,20005048.4188",
        /* experimental
        geometry_field: "the_geom",
        extent: "-180,-90,180,90",
        srid: 4326,
        */
        simplify: true
    }
    ,redis: {
        host: '127.0.0.1',
        port: 6379,
        idleTimeoutMillis: 1,
        reapIntervalMillis: 1
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
};

module.exports = config;
