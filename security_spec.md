# Security Specification & Threat Model (TDD)
## OST ERP - Firebase Auth & Firestore Hardening

### 1. Data Invariants & Zero-Trust Constraints

1. **Self-Promotion Block (Identity Integrity)**:
   - A standard user (e.g., Caixa, Vendedor) is forbidden from changing their own `perfil` (role) or `estado` (active status) to gain unauthorized administrative privileges.
   
2. **Account Blocking (User State Lockdown)**:
   - Users with an `estado` value of `"Inativo"` must be immediately denied all read and write privileges on any collections.

3. **Audit Log Immortality (Audit Log Invariance)**:
   - Security audit logs stored in the `logs` collection are strictly write-once, append-only.
   - Updates and deletions of logs are strictly forbidden for all roles, including administrators.

4. **Timestamp Integrity (Temporal Safety)**:
   - The fields `dataCriacao` (for user profiles) and `timestamp` (for logs) must match the server timestamp `request.time` exactly upon creation.
   - The field `ultimoLogin` on update must be validated using `request.time`.

5. **Entity ID Hardening (Malicious Path Isolation)**:
   - All document IDs used for `usuarios` and `logs` must match compliant character formats and be strictly size-constrained (<128 bytes) to avoid denial of wallet / storage flooding.

6. **PII Lockdown**:
   - Access to user profile fields (like contact `telefone` or `email`) is restricted to the authenticated user themselves or an administrator.

---

### 2. The "Dirty Dozen" Malicious Payloads
The following payloads are designed to breach identity, integrity, and state boundaries. They MUST result in `PERMISSION_DENIED` in our test cases.

#### Payload 1: Privilege Escalation on Profile Creation
- **Target Path**: `/usuarios/attacker_uid`
- **Attempt**: A newly registering user tries to self-assign the `"Administrador"` role.
```json
{
  "uid": "attacker_uid",
  "nomeCompleto": "Attacker Name",
  "email": "attacker@gmail.com",
  "empresa": "OST Comércio Geral",
  "perfil": "Administrador",
  "estado": "Ativo",
  "dataCriacao": "request.time"
}
```
*Expected Result: DENIED (Standard sign-ups default to "Operador" or "Caixa", admin can only be set from the database).*

#### Payload 2: Self-Promotion via Profile Update
- **Target Path**: `/usuarios/normal_user_uid`
- **Attempt**: Standard user tries to change their `perfil` from `"Caixa"` to `"Administrador"`.
```json
{
  "perfil": "Administrador"
}
```
*Expected Result: DENIED (Non-admins are forbidden from modifying the `perfil` field during update).*

#### Payload 3: Bypassing Deactivation Block (Inactive Read)
- **Target Path**: `/usuarios/some_profile_id` (Read attempt)
- **Attempt**: User profile with `"estado": "Inativo"` tries to read other user profiles.
*Expected Result: DENIED (Read rule rejects inactive user profile).*

#### Payload 4: Deactivated User Self-Activation
- **Target Path**: `/usuarios/deactivated_user_uid`
- **Attempt**: Deactivated user tries to set their state back to `"Ativo"`.
```json
{
  "estado": "Ativo"
}
```
*Expected Result: DENIED (State changes are only authorized for administrative users).*

#### Payload 5: Erasing Audit Trails (Log Deletion)
- **Target Path**: `/logs/log_999`
- **Attempt**: Attacker or administrative user tries to delete an audit log containing security breaches.
*Expected Result: DENIED (The delete operation on `logs` collection is globally forbidden).*

#### Payload 6: Modifying Audit History (Log Update)
- **Target Path**: `/logs/log_123`
- **Attempt**: Malicious actor tries to modify the description or timestamp of an existing security log.
```json
{
  "action": "Harmless Login Simulation",
  "details": "User logged in cleanly"
}
```
*Expected Result: DENIED (The update operation on `logs` collection is globally forbidden).*

#### Payload 7: Client-side Timestamp Spoofing (Historical Tampering)
- **Target Path**: `/usuarios/some_user_uid` (Create)
- **Attempt**: Specifying a fake historical registration date (`dataCriacao`) instead of using `request.time`.
```json
{
  "uid": "some_user_uid",
  "nomeCompleto": "Falsified User",
  "email": "spoof@gmail.com",
  "empresa": "Loja Matola",
  "perfil": "Operador",
  "estado": "Ativo",
  "dataCriacao": "2020-01-01T00:00:00Z"
}
```
*Expected Result: DENIED (Creation requires `dataCriacao == request.time`).*

#### Payload 8: Identity Spoofing (Owner Invariance Breach)
- **Target Path**: `/usuarios/victim_uid`
- **Attempt**: Attacker tries to modify a profile belonging to another operator.
*Expected Result: DENIED (Only the profile owner or an administrator can edit a profile).*

#### Payload 9: Orphaned Branch Association
- **Target Path**: `/usuarios/user_uid`
- **Attempt**: User attempts to bind their account to a fake or non-existent company branch ID.
*Expected Result: DENIED (Reference validation requires existence verification).*

#### Payload 10: Denial of Wallet via Giant Document ID
- **Target Path**: `/usuarios/GIGANTIC_1MB_STRING_JUNK_ID...`
- **Attempt**: Write a profile using a bloated string as the document ID.
*Expected Result: DENIED (Document ID must match `isValidId` patterns of length <= 128).*

#### Payload 11: Bulk Unrestricted Read Scraping (Query Enforcer Bypass)
- **Target Path**: `/logs/` (List query)
- **Attempt**: Logged-in cashier tries to fetch the complete log list of all users without administrative privileges.
*Expected Result: DENIED (Listing logs is restricted to authenticated managers or administrators).*

#### Payload 12: Ghost Field Injection (Shadow Update)
- **Target Path**: `/usuarios/my_uid`
- **Attempt**: Standard user attempts an update adding a shadow field `"isVerifiedPartner": true` not present in the strict schema.
*Expected Result: DENIED (The schema-guard blocks fields not explicitly whitelisted via `affectedKeys().hasOnly()`).*

---

### 3. Verification Test Suite Architecture

A complete test environment script (`firestore.rules.test.ts`) is designed below to run within the `@firebase/rules-unit-testing` emulator environment to verify these rules:

```typescript
import { initializeTestEnvironment, RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { setDoc, getDoc, updateDoc, deleteDoc, doc } from "firebase/firestore";

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "ost-vendas-test",
    firestore: {
      rules: require("fs").readFileSync("firestore.rules", "utf8")
    }
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

test("Denies standard users from escalating their own role", async () => {
  const aliceContext = testEnv.authenticatedContext("alice_uid", { email_verified: true });
  const aliceDb = aliceContext.firestore();
  
  await expect(
    setDoc(doc(aliceDb, "usuarios", "alice_uid"), {
      uid: "alice_uid",
      nomeCompleto: "Alice Caixa",
      email: "alice@ost.co.mz",
      empresa: "OST Comércio Geral",
      perfil: "Administrador", // Escalation attempt
      estado: "Ativo",
      dataCriacao: "serverTimestamp"
    })
  ).rejects.toThrow();
});

test("Audit logs are completely read-only once created and immutable", async () => {
  const adminContext = testEnv.authenticatedContext("admin_uid", { email_verified: true });
  const adminDb = adminContext.firestore();
  
  await expect(
    updateDoc(doc(adminDb, "logs", "log_123"), {
      action: "Tampered Action"
    })
  ).rejects.toThrow();
  
  await expect(
    deleteDoc(doc(adminDb, "logs", "log_123"))
  ).rejects.toThrow();
});
```
