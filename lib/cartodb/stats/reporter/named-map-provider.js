'use strict';

const statKeyTemplate = ctx => `windshaft.named-map-provider-cache.${ctx.metric}`;

module.exports = class NamedMapProviderReporter {
    constructor ({ namedMapProviderCache, intervalInMilliseconds } = {}) {
        this.namedMapProviderCache = namedMapProviderCache;
        this.intervalInMilliseconds = intervalInMilliseconds;
        this.intervalId = null;
    }

    start () {
        const { providerCache: cache } = this.namedMapProviderCache;
        const { statsClient: stats } = global;

        this.intervalId = setInterval(() => {
            stats.gauge(statKeyTemplate({ metric: 'named-map.count' }), cache.length);
            const providers = cache.dump();

            const namedMapInstantiations = providers.reduce((acc, { v: providers }) => {
                acc += Object.keys(providers).length;
                return acc;
            }, 0);

            stats.gauge(statKeyTemplate({ metric: 'named-map.instantiation.count' }), namedMapInstantiations);
        }, this.intervalInMilliseconds);
    }

    stop () {
        clearInterval(this.intervalId);
        this.intervalId = null;
    }
};
