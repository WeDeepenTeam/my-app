-- =============================================
-- EVENT GALLERY (self-contained — does not depend on a `media` table)
-- Migration: 20260506_gallery
-- =============================================

CREATE TABLE IF NOT EXISTS gallery_albums (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            TEXT UNIQUE NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  event_date      DATE,
  location        TEXT,
  cover_media_id  UUID,
  youtube_ids     TEXT[] DEFAULT '{}',
  event_page_slug TEXT,
  display_order   INT DEFAULT 0,
  is_published    BOOLEAN DEFAULT TRUE,
  is_archived     BOOLEAN DEFAULT FALSE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gallery_media (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  album_id        UUID NOT NULL REFERENCES gallery_albums(id) ON DELETE CASCADE,
  storage_path    TEXT NOT NULL,
  full_url        TEXT NOT NULL,
  thumb_url       TEXT NOT NULL,
  width           INT,
  height          INT,
  alt_text        TEXT DEFAULT '',
  display_order   INT DEFAULT 0,
  is_highlight    BOOLEAN DEFAULT FALSE,
  source_filename TEXT,
  content_hash    TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(album_id, content_hash)
);

DO $$ BEGIN
  ALTER TABLE gallery_albums
    ADD CONSTRAINT gallery_albums_cover_fk
    FOREIGN KEY (cover_media_id) REFERENCES gallery_media(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gallery_albums_published
  ON gallery_albums (display_order, event_date DESC)
  WHERE is_published = TRUE AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_gallery_albums_event_page
  ON gallery_albums (event_page_slug)
  WHERE event_page_slug IS NOT NULL AND is_archived = FALSE;

CREATE INDEX IF NOT EXISTS idx_gallery_media_album_order
  ON gallery_media (album_id, display_order);

CREATE INDEX IF NOT EXISTS idx_gallery_media_highlight
  ON gallery_media (album_id)
  WHERE is_highlight = TRUE;

CREATE OR REPLACE FUNCTION trg_gallery_albums_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gallery_albums_updated_at ON gallery_albums;
CREATE TRIGGER gallery_albums_updated_at
  BEFORE UPDATE ON gallery_albums
  FOR EACH ROW EXECUTE FUNCTION trg_gallery_albums_updated_at();

ALTER TABLE gallery_albums   ENABLE ROW LEVEL SECURITY;
ALTER TABLE gallery_media    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_published_albums" ON gallery_albums;
CREATE POLICY "public_read_published_albums"
  ON gallery_albums FOR SELECT
  USING (is_published = TRUE AND is_archived = FALSE);

DROP POLICY IF EXISTS "public_read_gallery_media" ON gallery_media;
CREATE POLICY "public_read_gallery_media"
  ON gallery_media FOR SELECT
  USING (TRUE);

-- Storage bucket `gallery` (public) is created via Storage API; see scripts/gallery/README.md.
