import mongoose, { Document, Model, Schema, Types } from 'mongoose';
import type { PublicationStatus } from '@/models/Blog';
import {
  buildReleaseNoteMarkdown,
  parseReleaseNoteFile,
  type ReleaseNoteSection,
} from '@/lib/release-notes-parser';

export interface IReleaseNote extends Document<Types.ObjectId> {
  siteId: Types.ObjectId;
  version: string;
  slug: string;
  releaseDate: Date;
  bodyMarkdown: string;
  intro: string[];
  sections: ReleaseNoteSection[];
  status: PublicationStatus;
  publishedAt: Date | null;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const ReleaseNoteItemSchema = new Schema(
  {
    type: {
      type: String,
      enum: ['paragraph', 'bullet', 'numbered', 'subheading'],
      required: true,
    },
    text: { type: String, required: true },
  },
  { _id: false },
);

const ReleaseNoteSectionSchema = new Schema(
  {
    title: { type: String, required: true },
    items: { type: [ReleaseNoteItemSchema], default: [] },
  },
  { _id: false },
);

const ReleaseNoteSchema = new Schema<IReleaseNote>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: 'Site', required: true, index: true },
    version: { type: String, required: true },
    slug: { type: String, required: true },
    releaseDate: { type: Date, required: true },
    bodyMarkdown: { type: String, required: true },
    intro: { type: [String], default: [] },
    sections: { type: [ReleaseNoteSectionSchema], default: [] },
    status: { type: String, enum: ['draft', 'publish'], default: 'publish' },
    publishedAt: { type: Date, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true, collection: 'release_notes' },
);

ReleaseNoteSchema.pre('validate', function refreshSnapshotAndPublication() {
  if (
    this.isNew ||
    this.isModified('version') ||
    this.isModified('releaseDate') ||
    this.isModified('bodyMarkdown')
  ) {
    const dateLabel = this.releaseDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    });
    const parsed = parseReleaseNoteFile(
      buildReleaseNoteMarkdown(this.version, dateLabel, this.bodyMarkdown),
      `${this.slug}.md`,
    );
    this.intro = parsed.intro;
    this.sections = parsed.sections;
  }
  if (this.status === 'publish' && !this.publishedAt) this.publishedAt = new Date();
});

ReleaseNoteSchema.index({ siteId: 1, slug: 1 }, { unique: true });
ReleaseNoteSchema.index({ siteId: 1, releaseDate: -1 });

const ReleaseNote: Model<IReleaseNote> =
  mongoose.models.ReleaseNote || mongoose.model<IReleaseNote>('ReleaseNote', ReleaseNoteSchema);

export default ReleaseNote;
