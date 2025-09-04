import { Injectable } from '@nestjs/common';
import * as admin from 'firebase-admin';

@Injectable()
export class FirebaseStorageService {
  private initialized = false;

  private init() {
    if (this.initialized) return;
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    const bucket = process.env.FIREBASE_STORAGE_BUCKET;
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey } as any),
        storageBucket: bucket,
      });
    }
    this.initialized = true;
  }

  async uploadBuffer(path: string, buffer: Buffer, contentType?: string): Promise<string> {
    this.init();
    const bucket = admin.storage().bucket();
    const file = bucket.file(path);
    await file.save(buffer, { contentType, resumable: false, public: true });
    await file.makePublic();
    return `https://storage.googleapis.com/${bucket.name}/${encodeURIComponent(path)}`;
  }
}


