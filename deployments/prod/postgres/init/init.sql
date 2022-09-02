CREATE extension IF NOT exists "uuid-ossp";
SELECT 'CREATE DATABASE november' WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'november');
-- CREATE DATABASE november;