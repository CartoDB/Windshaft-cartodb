module.exports.name             = 'production';
module.exports.postgres         = {user: 'tileuser', host: '127.0.0.1', port: 6432};
module.exports.redis            = {host: '127.0.0.1', port: 6379};
module.exports.windshaft_port   = 8181;
module.exports.lru_cache = true;
module.exports.lru_cache_size = 10000;
module.exports.ttl_timeout = 600; // 10 minutes
