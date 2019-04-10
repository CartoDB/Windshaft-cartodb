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
    && add-apt-repository -y ppa:cartodb/postgresql-11 \
    && add-apt-repository -y ppa:cartodb/redis-next \
    && curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.34.0/install.sh | bash \
    && . ~/.nvm/nvm.sh \
    && locale-gen en_US.UTF-8 \
    && update-locale LANG=en_US.UTF-8

RUN set -ex \
    && apt-get update \
    && apt-get install -y \
        g++-4.9 \
        gcc-4.9 \
        git \
        libcairo2-dev \
        libgdal-dev=2.3.2+dfsg-2build2~carto1 \
        libgdal20=2.3.2+dfsg-2build2~carto1  \
        libgeos-dev=3.7.1~carto1 \
        libgif-dev \
        libjpeg8-dev \
        libjson-c-dev \
        libpango1.0-dev \
        libpixman-1-dev \
        libproj-dev \
        libprotobuf-c-dev \
        libxml2-dev \
        gdal-bin=2.3.2+dfsg-2build2~carto1 \
        make \
        nodejs \
        protobuf-c-compiler \
        pkg-config \
        wget \
        zip \
        libopenscenegraph100v5 \
        libsfcgal1 \
        liblwgeom-2.5.0=2.5.1.4+carto-1 \
        postgresql-11 \
        postgresql-11-plproxy \
        postgis=2.5.1.4+carto-1 \
        postgresql-11-postgis-2.5=2.5.1.4+carto-1 \
        postgresql-11-postgis-2.5-scripts=2.5.1.4+carto-1 \
        postgresql-client-11 \
        postgresql-client-common \
        postgresql-common \
        postgresql-contrib \
        postgresql-plpython-11 \
        postgresql-server-dev-11 \
        redis=5:4.0.9-1carto1~xenial1 \
    && apt-get purge -y wget protobuf-c-compiler \
    && apt-get autoremove -y

# Configure PostgreSQL
RUN set -ex \
    && echo "listen_addresses='*'" >> /etc/postgresql/11/main/postgresql.conf \
    && echo "local     all       all                     trust" >  /etc/postgresql/11/main/pg_hba.conf \
    && echo "host      all       all       0.0.0.0/0     trust" >> /etc/postgresql/11/main/pg_hba.conf \
    && echo "host      all       all       ::1/128       trust" >> /etc/postgresql/11/main/pg_hba.conf \
    && /etc/init.d/postgresql start \
    && createdb template_postgis \
    && createuser publicuser \
    && psql -c "CREATE EXTENSION postgis" template_postgis \
    && /etc/init.d/postgresql stop

WORKDIR /srv
EXPOSE 5858

COPY ./scripts/nodejs-install.sh /src/nodejs-install.sh
RUN chmod 777 /src/nodejs-install.sh
CMD /src/nodejs-install.sh
