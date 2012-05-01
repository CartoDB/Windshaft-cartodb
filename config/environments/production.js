var config = {
     environment: 'production'
    ,port: 8181
    ,host: '127.0.0.1'
    ,enable_cors: true
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
        host: '127.0.0.1',
        port: 8080
    }
    ,varnish: {
        host: 'localhost',
        port: 6082
    }
};

module.exports = config;