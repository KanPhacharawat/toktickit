# Lab 1 — Test Plan and Evidence

All test files live under server/tests/lab-01/ and client/tests/lab-01/.

| #   | Tool      | Test                                                        | Result |
| --- | --------- | ----------------------------------------------------------- | ------ |
| 1   | Supertest | GET /api/health returns 200, status=ok                      | Passed |
| 2   | Supertest | GET /api/categories returns 4 seeded categories in id order | Passed |
| 3   | Vitest    | Heading renders                                             | Passed |
| 4   | Vitest    | Success state shows Online + category list                  | Passed |
| 5   | Vitest    | Error state shows Offline + message                         | Passed |

Paste your passing terminal output / screenshot below.

Commands

```
C:\Users\Kan\Documents\GitHub\toktickit> cd client
C:\Users\Kan\Documents\GitHub\toktickit\client> npm run test
```

Output

```
✓ tests/lab-01/App.test.tsx (4)
   ✓ App (4)
     ✓ renders the TokTickIT heading
     ✓ shows Online and the categories returned by the API on success
     ✓ shows a loading state while the request is in flight
     ✓ shows an Offline error message when the API is unavailable

 Test Files  1 passed (1)
      Tests  4 passed (4)
```

Commands

```
C:\Users\Kan\Documents\GitHub\toktickit> cd server
C:\Users\Kan\Documents\GitHub\toktickit\server> npm run test
```

Output

```
 ✓ tests/lab-01/categories.test.ts (1)
 ✓ tests/lab-01/health.test.ts (1)

 Test Files  2 passed (2)
      Tests  2 passed (2)
```
