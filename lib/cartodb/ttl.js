
/*
 ==========================================================
 manages timeouts
     * timeout in seconds
     * on_delete will be called when time expired with the key as first param
  
  usage:
    ttl = TTL(function(key) {
        console.log("10 seconds expired on " + key");
    }, 10);
 ==========================================================
*/
function TTL(on_delete, timeout) {

    var me = {
        timeouts: {},
        on_delete: on_delete,
        timeout: timeout*1000
    };

    me.start = function(key) {
        var t = me.timeouts[key];
        if (t) {
            clearTimeout(t);
        }
        me.timeouts[key] = setTimeout(
            (function(k) {
                return function() {
                    me.on_delete(k);
                };
            })(key),
            me.timeout);
    }

    me.remove = function(key) {
        var t = me.timeouts[key];
        if (t) {
           clearTimeout(t);
           delete me.timeouts[key];
        }
    }

    return me;
}

module.exports = TTL;
