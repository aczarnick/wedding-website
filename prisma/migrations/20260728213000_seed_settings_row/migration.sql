BEGIN TRY

BEGIN TRAN;

-- The Settings row is a singleton the app cannot serve without: requireSettings
-- throws settings_missing (HTTP 500) when it is absent, which takes down the
-- public RSVP lookup as well as the admin console. Migrations create tables, not
-- rows, so a freshly migrated environment is broken until this lands.
--
-- The deadline is an initial default, not a fixed decision — change it at
-- /admin/settings. Guarded so an environment that already has the row (local
-- databases seeded by prisma/seed.ts) is left untouched.
IF NOT EXISTS (SELECT 1 FROM [dbo].[Settings])
BEGIN
    INSERT INTO [dbo].[Settings] ([id], [rsvpDeadline], [defaultAddGuestCap])
    VALUES (1, '2026-09-10T00:00:00.000Z', 5);
END;

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
