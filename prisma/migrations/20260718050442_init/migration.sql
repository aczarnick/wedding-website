BEGIN TRY

BEGIN TRAN;

-- CreateTable
CREATE TABLE [dbo].[Party] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [displayName] NVARCHAR(1000) NOT NULL,
    [message] NVARCHAR(1000),
    [addGuestCap] INT NOT NULL CONSTRAINT [Party_addGuestCap_df] DEFAULT 5,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Party_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Party_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Guest] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [partyId] UNIQUEIDENTIFIER NOT NULL,
    [firstName] NVARCHAR(1000) NOT NULL,
    [lastName] NVARCHAR(1000) NOT NULL,
    [rsvpStatus] NVARCHAR(1000) NOT NULL CONSTRAINT [Guest_rsvpStatus_df] DEFAULT 'pending',
    [songRequest] NVARCHAR(1000),
    [source] NVARCHAR(1000) NOT NULL CONSTRAINT [Guest_source_df] DEFAULT 'admin',
    [flaggedForReview] BIT NOT NULL CONSTRAINT [Guest_flaggedForReview_df] DEFAULT 0,
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [Guest_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    [updatedAt] DATETIME2 NOT NULL,
    CONSTRAINT [Guest_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[AuditEntry] (
    [id] UNIQUEIDENTIFIER NOT NULL,
    [partyId] UNIQUEIDENTIFIER NOT NULL,
    [guestId] UNIQUEIDENTIFIER,
    [action] NVARCHAR(1000) NOT NULL,
    [actorType] NVARCHAR(1000) NOT NULL,
    [actorEmail] NVARCHAR(1000),
    [before] NVARCHAR(max),
    [after] NVARCHAR(max),
    [ipAddress] NVARCHAR(1000),
    [createdAt] DATETIME2 NOT NULL CONSTRAINT [AuditEntry_createdAt_df] DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT [AuditEntry_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- CreateTable
CREATE TABLE [dbo].[Settings] (
    [id] INT NOT NULL CONSTRAINT [Settings_id_df] DEFAULT 1,
    [rsvpDeadline] DATETIME2 NOT NULL,
    [defaultAddGuestCap] INT NOT NULL CONSTRAINT [Settings_defaultAddGuestCap_df] DEFAULT 5,
    CONSTRAINT [Settings_pkey] PRIMARY KEY CLUSTERED ([id])
);

-- AddForeignKey
ALTER TABLE [dbo].[Guest] ADD CONSTRAINT [Guest_partyId_fkey] FOREIGN KEY ([partyId]) REFERENCES [dbo].[Party]([id]) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE [dbo].[AuditEntry] ADD CONSTRAINT [AuditEntry_partyId_fkey] FOREIGN KEY ([partyId]) REFERENCES [dbo].[Party]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE [dbo].[AuditEntry] ADD CONSTRAINT [AuditEntry_guestId_fkey] FOREIGN KEY ([guestId]) REFERENCES [dbo].[Guest]([id]) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddCheckConstraint (enum value enforcement — SQL Server has no native enum type)
ALTER TABLE [dbo].[Guest] ADD CONSTRAINT [CK_Guest_rsvpStatus] CHECK ([rsvpStatus] IN (N'pending', N'attending', N'declined'));
ALTER TABLE [dbo].[Guest] ADD CONSTRAINT [CK_Guest_source] CHECK ([source] IN (N'admin', N'guest_added'));
ALTER TABLE [dbo].[AuditEntry] ADD CONSTRAINT [CK_AuditEntry_actorType] CHECK ([actorType] IN (N'guest', N'admin'));
ALTER TABLE [dbo].[Settings] ADD CONSTRAINT [CK_Settings_singleton] CHECK ([id] = 1);

COMMIT TRAN;

END TRY
BEGIN CATCH

IF @@TRANCOUNT > 0
BEGIN
    ROLLBACK TRAN;
END;
THROW

END CATCH
