var config = {
    environment: 'production'
    ,port: 8181
    ,host: '127.0.0.1'
    ,enable_cors: true
    ,cache_enabled: true
    ,postgres: {
        user: "tileuser",
        host: '127.0.0.1',
        port: 6432,
        simplify: true
    }
    ,redis: {
        host: '127.0.0.1',
        port: 6379
    }
    ,sqlapi: {
        protocol: 'https',
        host: 'cartodb.com',
        port: 8080,
        version: 'v2'
    }
    ,varnish: {
        host: 'localhost',
        port: 6082
    }
};

module.exports = config;