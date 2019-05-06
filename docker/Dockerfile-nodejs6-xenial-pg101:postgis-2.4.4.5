FROM ubuntu:xenial

# Use UTF8 to avoid encoding problems with pgsql
ENV LANG C.UTF-8
ENV NPROCS 1
ENV JOBS 1
ENV CXX g++-4.9
ENV PGUSER postgres

# Add external repos
RUN set -ex \
    && apt-get update \
    && apt-get install -y \
        curl \
        software-properties-common \
        locales \
    && add-apt-repository -y ppa:ubuntu-toolchain-r/test \
    && add-apt-repository -y ppa:cartodb/postgresql-10 \
    && add-apt-repository -y ppa:cartodb/gis \
    && curl -sL https://deb.nodesource.com/setup_6.x | bash \
    && locale-gen en_US.UTF-8 \
    && update-locale LANG=en_US.UTF-8

RUN set -ex \
    && apt-get update \
    && apt-get install -y \
        g++-4.9 \
        gcc-4.9 \
        git \
        libcairo2-dev \
        libgdal-dev \
        libgdal1i \
        libgdal20 \
        libgeos-dev \
        libgif-dev \
        libjpeg8-dev \
        libjson-c-dev \
        libpango1.0-dev \
        libpixman-1-dev \
        libproj-dev \
        libprotobuf-c-dev \
        libxml2-dev \
        gdal-bin \
        make \
        nodejs \
        protobuf-c-compiler \
        pkg-config \
        wget \
        zip \
        postgresql-10 \
        postgresql-10-plproxy \
        postgis=2.4.4.5+carto-1 \
        postgresql-10-postgis-2.4=2.4.4.5+carto-1 \
        postgresql-10-postgis-2.4-scripts=2.4.4.5+carto-1 \
        postgresql-10-postgis-scripts=2.4.4.5+carto-1 \
        postgresql-client-10 \
        postgresql-client-common \
        postgresql-common \
        postgresql-contrib \
        postgresql-plpython-10 \
        postgresql-server-dev-10 \
    && wget http://download.redis.io/releases/redis-4.0.8.tar.gz \
    && tar xvzf redis-4.0.8.tar.gz \
    && cd redis-4.0.8 \
    && make \
    && make install \
    && cd .. \
    && rm redis-4.0.8.tar.gz \
    && rm -R redis-4.0.8 \
    && apt-get purge -y wget protobuf-c-compiler \
    && apt-get autoremove -y

# Configure PostgreSQL
RUN set -ex \
    && echo "listen_addresses='*'" >> /etc/postgresql/10/main/postgresql.conf \
    && echo "local     all       all                     trust" >  /etc/postgresql/10/main/pg_hba.conf \
    && echo "host      all       all       0.0.0.0/0     trust" >> /etc/postgresql/10/main/pg_hba.conf \
    && echo "host      all       all       ::1/128       trust" >> /etc/postgresql/10/main/pg_hba.conf \
    && /etc/init.d/postgresql start \
    && createdb template_postgis \
    && createuser publicuser \
    && psql -c "CREATE EXTENSION postgis" template_postgis \
    && /etc/init.d/postgresql stop

WORKDIR /srv
EXPOSE 5858

CMD /etc/init.d/postgresql start
