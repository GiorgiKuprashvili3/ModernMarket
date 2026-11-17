/** What the access token carries. Public identifier only: internal numeric ids never leave the backend. */
export interface AuthenticatedUser {
  /** users.uuid */
  uuid: string;
  /** Role keys, e.g. ['buyer'] or ['admin']. Authorization still re-checks ownership in services. */
  roles: string[];
}

export interface AccessTokenPayload {
  sub: string;
  roles: string[];
}
