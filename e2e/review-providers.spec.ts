import { test, expect } from '@playwright/test';

test.describe('EPIC 2: Review Providers', () => {

  const PROVIDER_ID = '69c10488f2a9986bee14676e';
  const PROVIDER_URL = `/providers/${PROVIDER_ID}`;

  // =================================================================
  // US2-1, US2-2, US2-3: ฝั่ง User ทั่วไป (ดูรีวิว, เขียนรีวิว, แก้ไขรีวิว)
  // =================================================================
  test.describe('User Role: View and Manage Reviews', () => {
    test.beforeEach(async ({ page }) => {
      // 1. จำลองการเข้าสู่ระบบด้วยบัญชี User
      await page.goto('/login');
      await page.fill('input[type="email"]', 'title@gmail.com');
      await page.fill('input[type="password"]', '123456');
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/');

      // 2. MOCK: ดักจับ API ของ SSR เพื่อจำลองข้อมูล Provider (Phuket Island Cars)
      await page.route(`**/api/providers/${PROVIDER_ID}/detail`, async route => {
        await route.fulfill({
          status: 200,
          json: {
            success: true,
            data: {
              provider: { _id: PROVIDER_ID, name: 'Phuket Island Cars', address: 'Phuket', avgRating: 4.5, reviewCount: 2 },
              cars: [],
              bookings: [],
              reviews: [
                { _id: 'mock_rev_1', user: { _id: 'mock_user_id', name: 'Test User' }, rating: 3, comment: 'Normal service.' }, // สมมติว่าเป็นรีวิวของ User คนนี้
                { _id: 'mock_rev_2', user: { _id: 'other', name: 'Alice' }, rating: 5, comment: 'Very good!' } // รีวิวของคนอื่น
              ]
            }
          }
        });
      });
    });

    // --- US2-3: View all reviews and average rating ---
    test('US2-3: Should display provider average rating and list of reviews', async ({ page }) => {
      // บังคับให้โหลดผ่าน Client-side navigation เพื่อให้ Playwright ดัก API ทัน
      await page.goto('/');
      await page.goto(PROVIDER_URL);

      // ตรวจสอบว่าแสดงชื่อ Phuket Island Cars 
      await expect(page.locator('h1').filter({ hasText: 'Phuket Island Cars' })).toBeVisible({ timeout: 10000 });

      // ตรวจสอบว่าแสดงคะแนนเฉลี่ย 4.5 
      await expect(page.locator('span').filter({ hasText: '5' }).first()).toBeVisible();

      // ตรวจสอบว่าแสดงรีวิวของคนอื่นๆ
      await expect(page.getByText('car is good')).toBeVisible();
    });

    // --- US2-1: Submit a review (Success) ---
    test('US2-1: Should submit a review successfully', async ({ page }) => {
      // MOCK: ให้สิทธิ์รีวิว (มีรถที่คืนแล้ว)
      await page.route(`**/api/providers/${PROVIDER_ID}/reviews/can-review`, async route => {
        await route.fulfill({
          status: 200,
          json: { success: true, data: { canReview: true, hasCompletedRentals: true, availableRentals: [{ _id: 'rental123' }] } }
        });
      });

      // MOCK: ยิง POST สร้างรีวิวสำเร็จ
      await page.route(`**/api/providers/${PROVIDER_ID}/reviews`, async route => {
        if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            json: { success: true, data: { _id: 'mock_rev_new', rating: 5, comment: 'Great service!' } }
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/');
      await page.goto(PROVIDER_URL);

      await page.waitForSelector('button:has-text("Write a Review")', { state: 'visible', timeout: 10000 });
      await page.click('button:has-text("Write a Review")');

      // กดให้ดาว (ดึงจาก UI ชุดดาวดวงที่ 5)
      const ratingContainer = page.locator('div').filter({ hasText: 'Rating' }).last();
      await ratingContainer.locator('button, svg').nth(4).click();
      
      // พิมพ์ข้อความและ Submit
      await page.getByPlaceholder(/experience/i).fill('Great service!');
      await page.click('button:has-text("Submit")');

      // แจ้งเตือนว่าสำเร็จ
      await expect(page.getByText(/success|submitted/i).first()).toBeVisible({ timeout: 5000 });
    });

    // --- US2-1: Submit a review (Error - No Rating) ---
    test('US2-1 (Error): Should show validation error when submitting without rating', async ({ page }) => {
      await page.route(`**/api/providers/${PROVIDER_ID}/reviews/can-review`, async route => {
        await route.fulfill({
          status: 200,
          json: { success: true, data: { canReview: true, hasCompletedRentals: true, availableRentals: [{ _id: 'rental123' }] } }
        });
      });

      await page.goto('/');
      await page.goto(PROVIDER_URL);
      
      await page.waitForSelector('button:has-text("Write a Review")', { state: 'visible', timeout: 10000 });
      await page.click('button:has-text("Write a Review")');

      // พิมพ์แต่ข้อความ ไม่กดดาว
      await page.getByPlaceholder(/experience/i).fill('This review has no rating');
      await page.click('button:has-text("Submit")');

      // ต้องฟ้อง Error Validation จาก Frontend
      await expect(page.getByText(/Please select a rating|Rating is required/i).first()).toBeVisible();
    });

    // --- US2-1: Submit a review (Error - Ineligible) ---
    test('US2-1 (Error): Should hide "Write a Review" button if no completed rental', async ({ page }) => {
      // MOCK: ไม่มีสิทธิ์รีวิว
      await page.route(`**/api/providers/${PROVIDER_ID}/reviews/can-review`, async route => {
        await route.fulfill({
          status: 200,
          json: { success: true, data: { canReview: false, hasCompletedRentals: false, availableRentals: [] } }
        });
      });

      await page.goto('/');
      await page.goto(PROVIDER_URL);
      
      // ปุ่มต้องไม่ปรากฏ
      await expect(page.locator('button:has-text("Write a Review")')).not.toBeVisible();
    });

    // --- US2-2: Edit own review ---
    test('US2-2: Should edit an existing review successfully', async ({ page }) => {
      // MOCK: จำลองการยิง PUT เพื่ออัปเดตข้อมูล
      await page.route(`**/api/providers/${PROVIDER_ID}/reviews/*`, async route => {
        if (route.request().method() === 'PUT') {
          await route.fulfill({
            status: 200,
            json: { success: true, data: { _id: 'mock_rev_1', rating: 5, comment: 'Updated to Excellent!' } }
          });
        } else {
          await route.continue();
        }
      });

      await page.goto('/');
      await page.goto(PROVIDER_URL);

      // 👉 แก้ไข: รอให้ปุ่ม Edit โผล่ขึ้นมาแทนการหาจากข้อความคอมเมนต์
      await page.waitForSelector('button:has-text("Edit")', { state: 'visible', timeout: 10000 });
      // กดปุ่ม Edit
      await page.click('button:has-text("Edit")');

      // แก้ไขดาวเป็น 5
      const ratingContainer = page.locator('div').filter({ hasText: 'Rating' }).last();
      await ratingContainer.locator('button, svg').nth(4).click();

      // แก้ไขข้อความ 
      await page.getByPlaceholder(/experience/i).fill('Updated to Excellent!');
      
      // กดปุ่ม Update / Save / Submit
      await page.locator('button').filter({ hasText: /Update|Save|Submit/i }).first().click();

      // เช็คว่าขึ้น Toast แจ้งเตือนสำเร็จ
      await expect(page.getByText(/updated|success/i).first()).toBeVisible({ timeout: 5000 });
    });
  });

  // =================================================================
  // US2-4: ฝั่ง Admin (จัดการ/ลบรีวิว)
  // =================================================================
  test.describe('Admin Role: Moderate Reviews', () => {
    test.beforeEach(async ({ page }) => {
      // 1. เข้าสู่ระบบด้วยบัญชี Admin
      await page.goto('/login');
      await page.fill('input[type="email"]', 'admin@gmail.com');
      await page.fill('input[type="password"]', '123456'); 
      await page.click('button[type="submit"]');
      await expect(page).toHaveURL('/');
    });

    // --- US2-4: Delete inappropriate reviews ---
    test('US2-4: Admin should be able to delete an inappropriate review', async ({ page }) => {
      // MOCK: ดักจับการยิง DELETE
      await page.route('**/api/providers/*/reviews/*', async route => {
        if (route.request().method() === 'DELETE') {
          await route.fulfill({
            status: 200,
            json: { success: true, data: {} }
          });
        } else {
          await route.continue();
        }
      });

      // แอดมินไปหน้าจัดการระบบ
      await page.goto('/admin'); 

      // ไปที่แท็บ Reviews
      await page.getByText('Reviews', { exact: true }).click();
      await page.waitForSelector('.card', { timeout: 10000 });

      // เลือกรีวิวอันแรก แล้วกด Delete
      const firstReview = page.locator('.card').first();
      await firstReview.locator('button:has-text("Delete")').click();

      // กดยืนยันใน Modal/Dialog
      await page.click('button:has-text("Confirm")');

      // เช็คว่ามีข้อความยืนยันการลบ
      await expect(page.getByText(/deleted/i).first()).toBeVisible({ timeout: 5000 });
    });
  });

});