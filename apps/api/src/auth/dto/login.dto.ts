export class LoginDto {
  identifier?: string;
  // Compatibilidad temporal con clientes que aún envían `email`.
  email?: string;
  password: string;
}
