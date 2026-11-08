import { hash, compare } from 'bcryptjs';
import { applicationDataSource as db } from './data-source.js';
import { validatePassword } from '../modules/auth/domain/password-policy.js';

// Opt-in local fixture only. Never resets/re-seeds existing employee accounts.
async function main(): Promise<void> {
  const connection = new URL(process.env.DATABASE_URL ?? '');
  if (process.env.NODE_ENV !== 'development' || !['localhost','127.0.0.1','[::1]'].includes(connection.hostname)) throw new Error('LOCAL_DEVELOPMENT_ONLY');
  const username = process.env.DEV_FIELD_USERNAME, password = process.env.DEV_FIELD_PASSWORD;
  if (!username || !password || validatePassword(password) !== null) throw new Error('Provide DEV_FIELD_USERNAME / DEV_FIELD_PASSWORD (valid development-only password).');
  await db.initialize();
  try {
    const result = await db.transaction(async manager => {
      await manager.query("SELECT pg_advisory_xact_lock(hashtextextended('dev-field-r4-account',0))");
      const [existing] = await manager.query<Array<{id:string;email:string;password_hash:string;employee_code:string;full_name:string;is_active:boolean}>>(`SELECT u.id,u.email,u.password_hash,e.employee_code,e.full_name,(u.is_active AND e.is_active) AS is_active FROM users u LEFT JOIN employees e ON e.user_id=u.id WHERE u.email=$1 OR e.employee_code='DEV-FIELD-R4'`,[username]);
      if (existing) {
        if (existing.email !== username || existing.employee_code !== 'DEV-FIELD-R4' || existing.full_name !== 'Test hiện trường R4 (Development Only)' || !existing.is_active || !await compare(password,existing.password_hash)) throw new Error('Existing account differs; use Admin, never silently reset it.');
        return { username,employeeCode:existing.employee_code,created:false };
      }
      const [fixture] = await manager.query<Array<{ departmentId:string;branchId:string;teamId:string;actorId:string;roleId:string }>>(`SELECT d.id AS "departmentId",b.id AS "branchId",t.id AS "teamId",u.id AS "actorId",r.id AS "roleId" FROM departments d JOIN organization_teams t ON t.department_id=d.id AND t.code='DEMO-UAT-TEAM' AND t.is_active JOIN branches b ON b.code='HCM' AND b.is_active CROSS JOIN users u JOIN user_roles ur ON ur.user_id=u.id JOIN roles ar ON ar.id=ur.role_id AND ar.code='ADMIN' CROSS JOIN roles r WHERE d.code='DEMO-UAT' AND d.is_active AND u.is_active AND r.code='EMPLOYEE' ORDER BY u.id LIMIT 1`);
      if (!fixture) throw new Error('Active DEMO-UAT fixture and Admin required; no automatic organization creation.');
      const [user] = await manager.query<Array<{id:string}>>('INSERT INTO users(email,password_hash) VALUES($1,$2) RETURNING id',[username,await hash(password,12)]);
      await manager.query('INSERT INTO user_roles(user_id,role_id) VALUES($1,$2)',[user.id,fixture.roleId]);
      const [employee] = await manager.query<Array<{id:string}>>(`INSERT INTO employees(employee_code,full_name,employee_type,department_id,user_id) VALUES('DEV-FIELD-R4','Test hiện trường R4 (Development Only)','TECHNICAL',$1,$2) RETURNING id`,[fixture.departmentId,user.id]);
      await manager.query(`INSERT INTO employee_organization_assignments(employee_id,branch_id,department_id,is_primary,effective_from) VALUES($1,$2,$3,true,(now() AT TIME ZONE 'Asia/Bangkok')::date)`,[employee.id,fixture.branchId,fixture.departmentId]);
      await manager.query('INSERT INTO organization_team_memberships(team_id,employee_id,created_by) VALUES($1,$2,$3)',[fixture.teamId,employee.id,fixture.actorId]);
      await manager.query(`INSERT INTO configuration_audit_logs(resource_type,resource_id,action,new_value,created_by) VALUES('EMPLOYEE',$1,'DEV_ACCOUNT_CREATE',$2::jsonb,$3)`,[employee.id,JSON.stringify({ developmentOnly:true,employeeCode:'DEV-FIELD-R4',reason:'Tech Lead requested fresh field/camera acceptance account' }),fixture.actorId]);
      return { username,employeeCode:'DEV-FIELD-R4',created:true };
    });
    console.log(JSON.stringify(result));
  } finally { await db.destroy(); }
}
void main();
