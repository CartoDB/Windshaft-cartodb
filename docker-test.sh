export NPROCS=1 && export JOBS=1 && export CXX=g++-4.9 && export PGUSER=postgres

npm install -g yarn@0.27.5
yarn

 /etc/init.d/postgresql start

createdb template_postgis && createuser publicuser
psql -c "CREATE EXTENSION postgis" template_postgis

npm test