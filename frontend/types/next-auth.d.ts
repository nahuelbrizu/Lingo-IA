// types/next-auth.d.ts
import 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  /**
   * Extiende la interfaz de la Sesión para incluir propiedades personalizadas.
   */
  interface Session {
    wsToken?: string;
    user?: {
      id?: string | null;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  /**
   * Extiende la interfaz del Token para incluir propiedades personalizadas.
   */
  interface JWT {
    id?: string;
    wsToken?: string;
  }
}
