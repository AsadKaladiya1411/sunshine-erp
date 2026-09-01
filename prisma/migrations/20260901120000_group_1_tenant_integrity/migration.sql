-- Fail before changing constraints if existing data violates a Group 1 invariant.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "users" AS "user"
    JOIN "departments" AS "department"
      ON "department"."id" = "user"."department_id"
    WHERE "user"."organization_id" <> "department"."organization_id"
  ) THEN
    RAISE EXCEPTION 'Cannot enforce user-department tenant integrity: conflicting rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "organization_settings" AS "setting"
    JOIN "financial_years" AS "financial_year"
      ON "financial_year"."id" = "setting"."financial_year_id"
    WHERE "setting"."organization_id" <> "financial_year"."organization_id"
  ) THEN
    RAISE EXCEPTION 'Cannot enforce settings-financial-year tenant integrity: conflicting rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "organizations" AS "organization"
    LEFT JOIN "cities" AS "city"
      ON "city"."id" = "organization"."city_id"
    LEFT JOIN "states" AS "state"
      ON "state"."id" = "organization"."state_id"
    WHERE ("organization"."city_id" IS NOT NULL AND "organization"."state_id" IS NULL)
       OR ("organization"."state_id" IS NOT NULL AND "organization"."country_id" IS NULL)
       OR ("city"."id" IS NOT NULL AND "city"."state_id" <> "organization"."state_id")
       OR ("state"."id" IS NOT NULL AND "state"."country_id" <> "organization"."country_id")
  ) THEN
    RAISE EXCEPTION 'Cannot enforce organization geography integrity: conflicting rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "organizations" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" = "record"."created_by"
    WHERE "actor"."organization_id" <> "record"."id"
  ) OR EXISTS (
    SELECT 1
    FROM "organizations" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" = "record"."updated_by"
    WHERE "actor"."organization_id" <> "record"."id"
  ) OR EXISTS (
    SELECT 1
    FROM "departments" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" IN ("record"."created_by", "record"."updated_by")
    WHERE "actor"."organization_id" <> "record"."organization_id"
  ) OR EXISTS (
    SELECT 1
    FROM "users" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" IN ("record"."created_by", "record"."updated_by")
    WHERE "actor"."organization_id" <> "record"."organization_id"
  ) OR EXISTS (
    SELECT 1
    FROM "financial_years" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" IN ("record"."created_by", "record"."updated_by")
    WHERE "actor"."organization_id" <> "record"."organization_id"
  ) OR EXISTS (
    SELECT 1
    FROM "organization_settings" AS "record"
    JOIN "users" AS "actor" ON "actor"."id" IN ("record"."created_by", "record"."updated_by")
    WHERE "actor"."organization_id" <> "record"."organization_id"
  ) THEN
    RAISE EXCEPTION 'Cannot enforce tenant-safe common audit actors: conflicting rows exist.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "financial_years" AS "first_year"
    JOIN "financial_years" AS "second_year"
      ON "second_year"."organization_id" = "first_year"."organization_id"
     AND "second_year"."id" > "first_year"."id"
     AND daterange("second_year"."start_date", "second_year"."end_date", '[]')
         && daterange("first_year"."start_date", "first_year"."end_date", '[]')
  ) THEN
    RAISE EXCEPTION 'Cannot enforce financial-year non-overlap: conflicting rows exist.';
  END IF;
END
$$;

-- Composite reference targets required for tenant-safe foreign keys.
CREATE UNIQUE INDEX "states_id_country_id_key"
ON "states"("id", "country_id");

CREATE UNIQUE INDEX "cities_id_state_id_key"
ON "cities"("id", "state_id");

CREATE UNIQUE INDEX "departments_id_organization_id_key"
ON "departments"("id", "organization_id");

CREATE UNIQUE INDEX "financial_years_id_organization_id_key"
ON "financial_years"("id", "organization_id");

-- Replace independent geography foreign keys with hierarchy-aware keys.
ALTER TABLE "organizations"
DROP CONSTRAINT "organizations_city_id_fkey",
DROP CONSTRAINT "organizations_state_id_fkey";

ALTER TABLE "organizations"
ADD CONSTRAINT "organizations_geography_city_requires_state_check"
CHECK ("city_id" IS NULL OR "state_id" IS NOT NULL),
ADD CONSTRAINT "organizations_geography_state_requires_country_check"
CHECK ("state_id" IS NULL OR "country_id" IS NOT NULL),
ADD CONSTRAINT "organizations_city_id_state_id_fkey"
FOREIGN KEY ("city_id", "state_id")
REFERENCES "cities"("id", "state_id")
ON DELETE RESTRICT ON UPDATE CASCADE,
ADD CONSTRAINT "organizations_state_id_country_id_fkey"
FOREIGN KEY ("state_id", "country_id")
REFERENCES "states"("id", "country_id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- User and Organization Settings ownership must agree with their references.
ALTER TABLE "users"
DROP CONSTRAINT "users_department_id_fkey";

ALTER TABLE "users"
ADD CONSTRAINT "users_department_id_organization_id_fkey"
FOREIGN KEY ("department_id", "organization_id")
REFERENCES "departments"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "organization_settings"
DROP CONSTRAINT "organization_settings_financial_year_id_fkey";

ALTER TABLE "organization_settings"
ADD CONSTRAINT "organization_settings_financial_year_id_organization_id_fkey"
FOREIGN KEY ("financial_year_id", "organization_id")
REFERENCES "financial_years"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Replace common-foundation audit actor keys with tenant-safe composite keys.
ALTER TABLE "organizations"
DROP CONSTRAINT "organizations_created_by_fkey",
DROP CONSTRAINT "organizations_updated_by_fkey",
ADD CONSTRAINT "organizations_created_by_id_fkey"
FOREIGN KEY ("created_by", "id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "organizations_updated_by_id_fkey"
FOREIGN KEY ("updated_by", "id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "departments"
DROP CONSTRAINT "departments_created_by_fkey",
DROP CONSTRAINT "departments_updated_by_fkey",
ADD CONSTRAINT "departments_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "departments_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "users"
DROP CONSTRAINT "users_created_by_fkey",
DROP CONSTRAINT "users_updated_by_fkey",
ADD CONSTRAINT "users_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "users_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "financial_years"
DROP CONSTRAINT "financial_years_created_by_fkey",
DROP CONSTRAINT "financial_years_updated_by_fkey",
ADD CONSTRAINT "financial_years_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "financial_years_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

ALTER TABLE "organization_settings"
DROP CONSTRAINT "organization_settings_created_by_fkey",
DROP CONSTRAINT "organization_settings_updated_by_fkey",
ADD CONSTRAINT "organization_settings_created_by_organization_id_fkey"
FOREIGN KEY ("created_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT,
ADD CONSTRAINT "organization_settings_updated_by_organization_id_fkey"
FOREIGN KEY ("updated_by", "organization_id")
REFERENCES "users"("id", "organization_id")
ON DELETE RESTRICT ON UPDATE RESTRICT;

-- PostgreSQL exclusion constraints close the concurrent-insert race that a
-- query/check trigger would leave open. Inclusive date ranges retain the
-- existing start/end-date meaning; the next period may begin the following day.
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "public";

ALTER TABLE "financial_years"
ADD CONSTRAINT "financial_years_no_overlapping_periods_excl"
EXCLUDE USING gist (
  "organization_id" WITH =,
  daterange("start_date", "end_date", '[]') WITH &&
);
