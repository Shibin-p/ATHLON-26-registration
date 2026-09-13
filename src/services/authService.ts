import {
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  type UserCredential,
} from 'firebase/auth';
import { auth } from '../config/firebase';

export const loginWithEmail = async (
  email: string,
  pass: string
): Promise<UserCredential> => {
  return await signInWithEmailAndPassword(auth, email.trim(), pass);
};

export const logoutUser = async (): Promise<void> => {
  await signOut(auth);
};

export const sendPasswordReset = async (email: string): Promise<void> => {
  await sendPasswordResetEmail(auth, email.trim());
};
