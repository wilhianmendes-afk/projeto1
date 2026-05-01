create table if not exists face_skipped (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  source_id    uuid not null,
  source_label text,
  reason       text,                    -- 'no_face_detected' | 'photo_404' | 'low_det_score'
  created_at   timestamptz default now(),
  unique (source, source_id)
);
