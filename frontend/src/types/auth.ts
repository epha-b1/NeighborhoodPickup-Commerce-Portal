export type RoleName =
  | 'MEMBER'
  | 'GROUP_LEADER'
  | 'REVIEWER'
  | 'FINANCE_CLERK'
  | 'ADMINISTRATOR';

export type AuthUser = {
  id: number;
  username: string;
  roles: RoleName[];
};