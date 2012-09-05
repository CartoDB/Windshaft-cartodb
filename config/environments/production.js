var config = {
    environment: 'production'
    ,port: 8181
    ,host: '127.0.0.1'
    ,enable_cors: true
    ,cache_enabled: true
    ,postgres_auth_user: 'cartodb_user_<%= user_id %>'
    ,postgres: {
        user: "publicuser",
        host: '127.0.0.1',
        port: 6432,
        extent: "-20005048.4188,-20005048.4188,20005048.4188,20005048.4188",
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
        port: 6082,
        ttl: 86400
    }
};

module.exports = config;
