# eReferral App - Backend Documentation

This document tracks all backend processes, API endpoints, and changes in the eReferral application.

## Table of Contents
- [FHIR Client Library](#fhir-client-library)
- [API Routes](#api-routes)
- [Admin Pages](#admin-pages)
- [Authentication](#authentication)

---

## FHIR Client Library

**Location**: `src/lib/fhir.ts`

The FHIR client provides a thin REST client for interacting with the FHIRLab sandbox server.

### Configuration
- **Base URL**: `https://cdr.pheref.fhirlab.net/fhir` (configurable via `NEXT_PUBLIC_FHIR_BASE_URL`)
- **Content Type**: `application/fhir+json`
- **Authentication**: None (public sandbox)

### Available Functions

#### `submitTransaction(bundle: any)`
- **Purpose**: Submit an eReferral transaction bundle to the FHIR server
- **Method**: POST to server root
- **Usage**: Use Case 1 - Submit referral bundles

#### `fhirGet(path: string)`
- **Purpose**: Generic search/read operation
- **Method**: GET with `cache: no-store`
- **Usage**: Retrieve resources or search with query parameters
- **Example**: `fhirGet("Patient?identifier=12345")`

#### `patientEverything(patientId: string)`
- **Purpose**: Retrieve entire patient record via compartment
- **Method**: GET `Patient/{id}/$everything`
- **Usage**: Use Case 2 - Retrieve complete referral

#### `listIncomingTasks()`
- **Purpose**: Discover incoming referrals for receiving facility
- **Method**: GET `Task?status=requested` with includes
- **Usage**: Use Case 2 - List referral tasks

#### `patchTask(taskId: string, ops: any[])`
- **Purpose**: Update Task action points via JSON-Patch
- **Method**: PATCH with `application/json-patch+json`
- **Usage**: Use Case 2 - Update referral status

#### `fhirPost(resourceType: string, resource: any)`
- **Purpose**: Create a new FHIR resource
- **Method**: POST to resource type endpoint
- **Example**: `fhirPost("Patient", patientResource)`

#### `fhirPut(resourceType: string, id: string, resource: any)`
- **Purpose**: Update an existing FHIR resource
- **Method**: PUT to resource instance endpoint
- **Example**: `fhirPut("Practitioner", "123", practitionerResource)`

#### `fhirDelete(resourceType: string, id: string)`
- **Purpose**: Delete a FHIR resource
- **Method**: DELETE to resource instance endpoint
- **Example**: `fhirDelete("Organization", "456")`

#### `fhirConditionalPut(resourceType: string, identifierSystem: string, identifierValue: string, resource: any)`
- **Purpose**: Conditionally update or create a FHIR resource using identifier
- **Method**: PUT with identifier query parameter
- **Behavior**: Updates if resource with identifier exists, creates if not
- **Example**: `fhirConditionalPut("Organization", "https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code", "3056", organization)`

### Error Handling
All functions throw `FhirError` with:
- `status`: HTTP status code
- `message`: Error description
- `outcome`: FHIR OperationOutcome resource (if available)

---

## API Routes

All API routes are located in `src/app/api/` and follow Next.js App Router conventions.

### Patient API
**Route**: `/api/patient`

#### POST - Create Patient
- **Purpose**: Create patient with PH Core identifiers
- **Validation**:
  - Resource type must be `Patient`
  - Must have identifiers array (PhilSys, PhilHealth, or NHFR)
- **Response**: Created patient resource (201)

#### GET - Search/List Patients
- **Query Parameters**:
  - `identifier`: Search by PhilSys, PhilHealth, or NHFR ID
- **Response**: Patient bundle or single patient

### Organization API
**Route**: `/api/organization`

#### POST - Create/Update Organization
- **Purpose**: Create or update facility organization using conditional PUT with NHFR code
- **Validation**: Resource type must be `Organization`
- **Conditional Update**: If NHFR code is provided, uses conditional PUT to update existing or create new
  - PUT to `Organization?identifier=https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code|{nhfr_code}`
  - Returns 200 if updated, 201 if created
- **Regular Create**: If no NHFR code, uses regular POST
- **PH Core Identifiers**:
  - NHFR Code: `https://fhir.doh.gov.ph/phcore/Identifier/doh-nhfr-code`
  - HCPN Code: `https://fhir.doh.gov.ph/phcore/Identifier/hcpn`
- **Response**: Organization resource (200 or 201)

#### GET - Retrieve Organization
- **Query Parameters**:
  - `id`: Specific organization ID
- **Response**: Organization resource or bundle

### Practitioner API
**Route**: `/api/practitioner`

#### POST - Create/Update Practitioner
- **Purpose**: Create or update practitioner using conditional PUT with PRC license
- **Validation**: Resource type must be `Practitioner`
- **Conditional Update**: If PRC license is provided, uses conditional PUT to update existing or create new
  - PUT to `Practitioner?identifier=https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number|{prc_license}`
  - Returns 200 if updated, 201 if created
- **Regular Create**: If no PRC license, uses regular POST
- **PH Core Identifiers**:
  - PRC License: `https://fhir.doh.gov.ph/phcore/Identifier/doh-prc-license-number`
- **Response**: Practitioner resource (200 or 201)

#### GET - Retrieve Practitioner
- **Query Parameters**:
  - `id`: Specific practitioner ID
- **Response**: Practitioner resource or bundle

### PractitionerRole API
**Route**: `/api/practitioner-role`

#### POST - Create/Update PractitionerRole
- **Purpose**: Associate practitioner with organization and role using conditional PUT
- **Validation**:
  - Resource type must be `PractitionerRole`
  - Must reference both practitioner and organization
- **Conditional Update**: If role ID is provided, uses conditional PUT to update existing or create new
  - PUT to `PractitionerRole?identifier=https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id|{role_id}`
  - Returns 200 if updated, 201 if created
- **Regular Create**: If no role ID, uses regular POST
- **PH Core Identifiers**:
  - Role ID: `https://fhir.doh.gov.ph/pheref/Identifier/practitioner-role-id`
- **Response**: PractitionerRole resource (200 or 201)

#### GET - Search PractitionerRoles
- **Query Parameters**:
  - `practitioner`: Filter by practitioner reference
  - `organization`: Filter by organization reference
- **Response**: PractitionerRole bundle

### Condition API
**Route**: `/api/condition`

#### POST - Create Condition
- **Purpose**: Add encounter diagnosis
- **Validation**:
  - Resource type must be `Condition`
  - Must have category array (e.g., encounter-diagnosis)
- **Response**: Created condition resource (201)

#### GET - Retrieve Conditions
- **Query Parameters**:
  - `patient`: Filter by patient reference
  - `category`: Filter by category (e.g., encounter-diagnosis)
- **Response**: Condition bundle

### Observation API
**Route**: `/api/observation`

#### POST - Create Observation
- **Purpose**: Add vital signs or other observations
- **Validation**:
  - Resource type must be `Observation`
  - Must have category array (e.g., vital-signs)
- **Response**: Created observation resource (201)

#### GET - Retrieve Observations
- **Query Parameters**:
  - `patient`: Filter by patient reference
  - `category`: Filter by category (e.g., vital-signs)
- **Response**: Observation bundle

### Encounter API
**Route**: `/api/encounter`

#### POST - Create Encounter
- **Purpose**: Create encounter record
- **Validation**:
  - Resource type must be `Encounter`
  - Must reference patient (subject) and practitioner (participant)
- **Response**: Created encounter resource (201)

#### GET - Retrieve Encounters
- **Query Parameters**:
  - `patient`: Filter by patient reference
- **Response**: Encounter bundle

### Bundle Transaction API
**Route**: `/api/bundle`

#### POST - Submit Transaction Bundle
- **Purpose**: Submit multiple resources in a single atomic transaction
- **Validation**:
  - Resource type must be `Bundle`
  - Bundle type must be `transaction`
  - Must contain entries array
  - Each entry must have resource and request fields
- **Response**: Transaction response bundle (200)
- **Behavior**: Atomic - all succeed or all fail

### Practitioner Registration API
**Route**: `/api/register-practitioner`

#### POST - Register Practitioner with Role
- **Purpose**: Register a practitioner with their role and organization in a single transaction
- **Request Body**:
  - `givenName`: Required
  - `familyName`: Required
  - `prcLicense`: Optional (generates temp ID if not provided)
  - `organizationId`: Required
- **Process**:
  - Creates Practitioner resource with conditional PUT using PRC license
  - Creates PractitionerRole resource linking practitioner to organization
  - Uses transaction bundle for atomicity
- **Response**:
  - `success`: Boolean
  - `practitionerId`: Created practitioner ID
  - `bundle`: Transaction response bundle

---

## Admin Pages

Admin pages provide UI for managing practitioners and organizations with full CRUD operations.

### Practitioners Page
**Route**: `/admin/practitioners`

#### Features
- **View**: List all practitioners from FHIR server
- **Search**: Filter by name or PRC license
- **Pagination**: 10 items per page
- **Create**: Form with given name, family name, PRC license, active status
- **Edit**: Inline edit form in table row
- **Delete**: Confirmation dialog before deletion

#### State Management
- `items`: Fetched practitioners
- `loading`: Loading state
- `error`: Error messages
- `query`: Search query
- `page`: Current page number
- `showCreateForm`: Toggle create form
- `createForm`: New practitioner data
- `editingId`: ID of practitioner being edited
- `editForm`: Edit form data

#### FHIR Operations
- GET `Practitioner?_sort=family,given&_count=100`
- POST `Practitioner` (create)
- PUT `Practitioner/{id}` (update)
- DELETE `Practitioner/{id}` (delete)

### Organizations Page
**Route**: `/admin/organizations`

#### Features
- **View**: List all organizations from FHIR server
- **Search**: Filter by name, NHFR, or HCPN
- **Pagination**: 10 items per page
- **Create**: Form with name, NHFR ID, HCPN ID, address fields, active status
- **Edit**: Inline edit form in table row
- **Delete**: Confirmation dialog before deletion

#### State Management
- `items`: Fetched organizations
- `loading`: Loading state
- `error`: Error messages
- `query`: Search query
- `page`: Current page number
- `showCreateForm`: Toggle create form
- `createForm`: New organization data
- `editingId`: ID of organization being edited
- `editForm`: Edit form data

#### FHIR Operations
- GET `Organization?_sort=name&_count=100`
- POST `Organization` (create)
- PUT `Organization/{id}` (update)
- DELETE `Organization/{id}` (delete)

---

## Authentication

**Location**: `src/lib/auth.tsx`, `src/lib/users.ts`

### User Storage
Since the FHIR server has no authentication, the app maintains its own user registry in localStorage.

**Location**: `src/lib/users.ts`

#### User Account Structure
```typescript
interface UserAccount {
  id: string;
  username: string;
  password: string; // In production, this should be hashed
  role: "admin" | "practitioner" | "user";
  practitionerId?: string; // Link to FHIR Practitioner resource
  organizationId?: string; // Link to FHIR Organization resource
  createdAt: string;
  updatedAt: string;
  active: boolean;
}
```

#### User Management Functions
- `getUsers()`: Retrieve all users from localStorage
- `saveUsers(users)`: Save users to localStorage
- `findUserByUsername(username)`: Find user by username
- `findUserById(id)`: Find user by ID
- `createUser(account)`: Create new user account
- `updateUser(id, updates)`: Update existing user
- `deleteUser(id)`: Soft delete user (set active = false)
- `validateCredentials(username, password)`: Validate login credentials
- `linkPractitioner(userId, practitionerId)`: Link user to FHIR Practitioner
- `getUsersByPractitionerId(practitionerId)`: Get users linked to a practitioner
- `getUsersByOrganizationId(organizationId)`: Get users linked to an organization

### Authentication Context
**Location**: `src/lib/auth.tsx`

The app uses a client-side authentication context for demo purposes.

#### User Type
```typescript
type User = {
  id: string;
  username: string;
  role: "admin" | "practitioner" | "user";
  practitionerId?: string;
  organizationId?: string;
} | null;
```

#### Auth Functions
- `login(username, password)`: Authenticate user against user store
- `logout()`: Clear session
- `useAuth()`: React hook to access auth state

#### Auth State
- `user`: Current user object with role and practitioner/organization links
- `ready`: Auth system initialized
- `login()`, `logout()`: Auth methods

### Default Users
- **Admin**: `admin` / `@admin123` - Access to admin pages
- **Practitioners**: Created via registration flow

---

## PH Core IG Profile Compliance

### Patient Resource
- Must include PH Core identifiers:
  - PhilSys ID: `https://philsys.gov.ph/id`
  - PhilHealth ID: `https://philhealth.gov.ph/id`
  - NHFR ID: `https://nhfr.doh.gov.ph`

### Organization Resource
- Must include facility identifiers:
  - NHFR Code: `https://nhfr.doh.gov.ph`
  - HCPN Code: `https://hcpn.doh.gov.ph`

### Practitioner Resource
- Must include professional identifiers:
  - PRC License: `https://prc.gov.ph/license`

### Condition Resource
- Must include category for encounter diagnosis
- Code system: ICD-10 or SNOMED CT

### Observation Resource
- Must include category for vital-signs
- LOINC code system for vital signs

---

## Change Log

### 2026-06-23
- Added FHIR POST, PUT, DELETE functions to `fhir.ts`
- Created API routes for Patient, Organization, Practitioner, PractitionerRole, Condition, Observation, Encounter
- Created Bundle transaction API endpoint
- Added CRUD functionality to practitioners admin page
- Added CRUD functionality to organizations admin page
- Added pagination to admin pages
- Added Breadcrumb and PageHeader components to admin pages

---

## Development Notes

### Environment Variables
- `NEXT_PUBLIC_FHIR_BASE_URL`: FHIR server base URL (default: FHIRLab sandbox)

### FHIR Server
- Currently using: `https://cdr.pheref.fhirlab.net/fhir`
- No authentication required (public sandbox)
- CORS enabled for browser access

### API Response Format
All API responses follow FHIR R4 format:
- Success: Returns FHIR resource or Bundle
- Error: Returns JSON with `error` message and optional `outcome` (OperationOutcome)

### Error Handling
- API routes return appropriate HTTP status codes
- FHIR errors include OperationOutcome details
- Client-side error handling with user-friendly messages

---

## Future Enhancements

- Add PUT/DELETE endpoints for individual resources
- Add validation against PH Core IG StructureDefinitions
- Add batch operations for multiple resources
- Add subscription support for real-time updates
- Add audit logging for all operations
- Add rate limiting and authentication for production
