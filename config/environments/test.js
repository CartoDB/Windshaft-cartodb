var config = {
     environment: 'test'
    ,port: 8888
    ,host: '127.0.0.1'
    ,enable_cors: true
    ,cache_enabled: false
    ,postgres: {
        user: "publicuser",
        db_user: 'test_cartodb_user_<%= user_id %>',
        host: '127.0.0.1',
        port: 5432,
        srid: 4326,
        extent: "-20005048.4188,-20005048.4188,20005048.4188,20005048.4188",
        simplify: true
    }
    ,redis: {
        host: '127.0.0.1',
        port: 6333,
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
        host: '',
        port: null
    }
};

module.exports = config;
