import { useEffect } from 'react';

export type Language = 'en' | 'id';
let activeLanguage: Language = 'en';

// English remains the source language. Keys are complete interface phrases so
// user-entered transaction, category, and profile text is left intact.
const id: Record<string, string> = {
  'Overview': 'Ringkasan', 'Transactions': 'Transaksi', 'transactions': 'transaksi', 'transaction': 'transaksi', 'Budgets': 'Budget', 'budgets': 'budget', 'budget': 'budget', 'Recurring': 'Jadwal', 'schedules': 'jadwal', 'schedule': 'jadwal', 'Categories': 'Kategori', 'categories': 'kategori', 'Settings': 'Pengaturan', 'entries': 'entri', 'of': 'dari',
  'Add transaction': 'Tambah transaksi', 'Recently deleted': 'Baru saja dihapus', 'Transaction details': 'Detail transaksi', 'Create a budget': 'Buat budget', 'Budget details': 'Detail budget', 'New recurring schedule': 'Jadwal transaksi baru', 'Pending occurrences': 'Perlu dicek', 'Schedule details': 'Detail jadwal', 'Category details': 'Detail kategori', 'Account & security': 'Akun & keamanan',
  'Demo account': 'Akun demo', 'Sample data': 'Data contoh', 'Your profile': 'Profilmu', 'Main navigation': 'Navigasi utama', 'Mobile navigation': 'Navigasi seluler', 'Go back': 'Kembali', 'Dismiss': 'Tutup', 'Retry': 'Coba lagi', 'Sign out': 'Keluar', 'Sign in': 'Sign in', 'Sign up': 'Daftar', 'Back': 'Kembali', 'Cancel': 'Batal', 'Save': 'Simpan', 'Save changes': 'Simpan perubahan', 'Saving…': 'Menyimpan…', 'Delete': 'Hapus', 'Close': 'Tutup', 'Continue': 'Lanjutkan', 'Today': 'Hari ini', 'Clear': 'Hapus',
  'Expense': 'Pengeluaran', 'Income': 'Pemasukan', 'Expenses': 'Pengeluaran', 'Uncategorized': 'Tanpa kategori', 'All types': 'Semua jenis', 'All categories': 'Semua kategori', 'All statuses': 'Semua status', 'All frequencies': 'Semua frekuensi', 'Type': 'Jenis', 'Category': 'Kategori', 'Name': 'Nama', 'Icon': 'Ikon', 'Color': 'Warna', 'Amount': 'Jumlah', 'Date': 'Tanggal', 'To': 'Sampai', 'Description': 'Deskripsi', 'Note': 'Catatan', 'Merchant': 'Toko', 'Search': 'Cari', 'Filter': 'Filter', 'Filter by type': 'Filter berdasarkan jenis', 'Filter by category': 'Filter berdasarkan kategori', 'Sort by': 'Urutkan berdasarkan', 'Apply filters': 'Terapkan filter', 'Reset search and filters': 'Atur ulang pencarian dan filter', 'Previous page': 'Halaman sebelumnya', 'Next page': 'Halaman berikutnya', 'Pagination': 'Paginasi', 'Search options': 'Cari opsi', 'No options match': 'Tidak ada opsi yang cocok', 'Choose date': 'Pilih tanggal', 'Choose a date': 'Pilih tanggal', 'Choose a month': 'Pilih bulan', 'Spending limit': 'Batas pengeluaran', 'Budget period': 'Periode budget', 'left of': 'tersisa dari', 'MONTHLY CATEGORY BUDGET': 'BUDGET KATEGORI BULANAN', 'WEEKLY CATEGORY BUDGET': 'BUDGET KATEGORI MINGGUAN',
  'e.g. Lunch with friends': 'Contoh: Makan siang bersama teman', 'Where did it happen?': 'Di mana transaksinya?', 'Anything you’d like to remember': 'Catatan tambahan', 'Add a merchant': 'Tambahkan nama toko', 'Purchased items and other receipt details': 'Barang yang dibeli dan detail nota lainnya', 'e.g. Pet care': 'Contoh: Perawatan hewan', 'e.g. Rent': 'Contoh: Sewa',
  'newest first': 'terbaru', 'oldest first': 'terlama', 'highest first': 'terbesar', 'lowest first': 'terkecil', 'soonest first': 'terdekat', 'latest first': 'terjauh', 'Spending %: highest first': 'Persentase pengeluaran: tertinggi', 'Spending %: lowest first': 'Persentase pengeluaran: terendah', 'Remaining: lowest first': 'Sisa: paling sedikit', 'Remaining: highest first': 'Sisa: paling banyak', 'Next date: soonest first': 'Tanggal berikutnya: terdekat', 'Next date: latest first': 'Tanggal berikutnya: terjauh', 'Name: A–Z': 'Nama: A–Z', 'Name: Z–A': 'Nama: Z–A', 'Category: A–Z': 'Kategori: A–Z', 'Category: Z–A': 'Kategori: Z–A', 'Deleted: newest first': 'Dihapus: terbaru', 'Deleted: oldest first': 'Dihapus: terlama',
  'No matches this time': 'Tidak ada hasil yang cocok', 'Try another search or clear a filter.': 'Coba pencarian lain atau hapus filter.', 'No schedules yet': 'Belum ada jadwal', 'No budgets yet': 'Belum ada budget', 'No categories yet': 'Belum ada kategori', 'Nothing to restore': 'Belum ada yang bisa dipulihkan', 'Back to overview': 'Kembali ke ringkasan', 'View all': 'Lihat semua', 'Add category': 'Tambah kategori', 'New budget': 'Budget baru', 'New schedule': 'Jadwal baru', 'Export CSV': 'Ekspor CSV', 'CSV downloaded': 'CSV berhasil diunduh', 'Settings saved': 'Pengaturan tersimpan', 'Could not save settings': 'Pengaturan gagal disimpan. Coba lagi ya.', 'Name saved': 'Nama tersimpan', 'Signed in': 'Berhasil sign in', 'Signed out': 'Berhasil keluar', 'Could not sign out. Try again.': 'Gagal keluar. Coba lagi ya.',
  'YOUR STARTING POINT': 'TITIK AWAL', 'Money & display': 'Uang & tampilan', 'Available cash starts with your opening balance, then includes all income and expenses.': 'Saldo tersedia dimulai dari saldo awal, lalu mencakup semua pemasukan dan pengeluaran.', 'Opening balance': 'Saldo awal', 'This amount is separate from income and expenses.': 'Jumlah ini terpisah dari pemasukan dan pengeluaran.', 'Display currency': 'Mata uang', 'Changing display currency does not convert saved amounts.': 'Mengubah mata uang tampilan tidak mengonversi jumlah yang tersimpan.', 'Save settings': 'Simpan pengaturan', 'Language': 'Bahasa', 'English': 'English', 'Bahasa Indonesia': 'Bahasa Indonesia', 'Default add transaction view': 'Mode input transaksi default', 'Manual form': 'Input manual', 'Scan form': 'Input dari scan', 'Account security': 'Keamanan akun', 'Profile, password, and account actions': 'Profil, password, dan tindakan akun',
  'Change display currency?': 'Ubah mata uang tampilan?', 'Change currency': 'Ubah mata uang', 'Keep current currency': 'Pertahankan mata uang saat ini', 'Your saved amounts will be relabeled without conversion.': 'Jumlah tersimpan akan diberi label baru tanpa konversi.',  'SIGN-IN & SAFETY': 'AKSES & KEAMANAN', 'Password': 'Password', 'Reset your password': 'Atur ulang password', 'Delete account': 'Hapus akun', 'Access ends immediately. Your account and its saved data will be permanently erased after 30 days.': 'Akses langsung berakhir. Akun dan data tersimpan akan dihapus permanen setelah 30 hari.', 'Delete account?': 'Hapus akun?', 'Your transactions, categories, budgets and money settings are saved to your account. Manage scheduled transactions from the Scheduled page.': 'Transaksi, kategori, budget, dan pengaturan uang tersimpan di akunmu. Kelola jadwal transaksi dari halaman Jadwal.', 'Sign in to manage your account.': 'Sign in untuk mengelola akunmu.',
  'This will relabel your saved amounts from ': 'Jumlah tersimpan akan diberi label baru dari ', ' without converting them. The numbers will stay the same.': ' tanpa konversi. Angkanya akan tetap sama.',
  'Add a category': 'Tambah kategori', 'Make a label that sounds like you.': 'Buat nama kategori yang cocok buat kamu.', 'Parent category': 'Kategori induk', 'No parent category': 'Tanpa kategori induk', 'Category type': 'Jenis kategori', 'Choose category icon': 'Pilih ikon kategori', 'Choose category color': 'Pilih warna kategori', 'Give your category a name first.': 'Masukkan nama kategori dulu.', 'A category with this name already exists.': 'Kategori dengan nama ini sudah ada.', 'Choose a different name.': 'Pilih nama lain.', 'Save category': 'Simpan kategori', 'Could not save category': 'Kategori gagal disimpan. Coba lagi ya.', 'Category updated': 'Kategori diperbarui', 'Category not found': 'Kategori tidak ditemukan', 'It may have been removed.': 'Kategori mungkin telah dihapus.',
  'Transaction not found': 'Transaksi tidak ditemukan', 'It may have been deleted or the link may be out of date.': 'Transaksi mungkin sudah dihapus atau link-nya sudah kedaluwarsa.', 'Nothing is added automatically.': 'Tidak ada yang ditambahkan otomatis.',  'Add a regular bill or income and review it when it comes up.': 'Tambahkan tagihan atau pemasukan rutin, lalu cek saat waktunya tiba.', 'Create a schedule': 'Buat jadwal', 'Active': 'Aktif', 'Paused': 'Dijeda', 'Weekly': 'Mingguan', 'Monthly': 'Bulanan', 'Yearly': 'Tahunan', 'Pause': 'Jeda', 'Resume': 'Lanjutkan', 'Delete schedule?': 'Hapus jadwal?', 'Keep schedule': 'Pertahankan jadwal', 'Delete schedule': 'Hapus jadwal', 'Existing transactions will remain. This cannot be undone.': 'Transaksi yang sudah ada tetap tersimpan. Tindakan ini nggak bisa dibatalkan.',
  'Review': 'Cek', 'Skip': 'Lewati', 'Confirm': 'Konfirmasi', 'Edit': 'Edit', 'Ready to add': 'Siap ditambahkan', 'All caught up': 'Semua sudah dicek', 'UP NEXT FOR REVIEW': 'BERIKUTNYA UNTUK DICEK', 'Upcoming occurrences will appear here for you to review and confirm. Nothing is added automatically.': 'Transaksi berikutnya akan muncul di sini untuk kamu cek dan konfirmasi. Tidak ada yang ditambahkan otomatis.', 'pending occurrence': 'transaksi yang perlu dicek', 'pending occurrences': 'transaksi yang perlu dicek', ' and its pending occurrence? Existing transactions will remain. This cannot be undone.': ' dan transaksi terjadwalnya yang perlu dicek? Transaksi yang sudah ada tetap tersimpan. Tindakan ini nggak bisa dibatalkan.', 'Delete transaction?': 'Hapus transaksi?', 'Remove budget?': 'Hapus budget?', 'Draft': 'Draft', 'Open full size receipt preview': 'Buka pratinjau nota ukuran penuh', 'Selected receipt preview': 'Pratinjau nota yang dipilih', 'Full size preview of the selected receipt': 'Pratinjau ukuran penuh nota yang dipilih',
  'Checking your link': 'Memeriksa tautan', 'Please wait a moment.': 'Tunggu sebentar ya.', 'Couldn’t check your link': 'Tautan gagal diperiksa', 'Something went wrong. Please try again.': 'Ada masalah. Coba lagi ya.', 'Try again': 'Coba lagi', 'Link expired or invalid': 'Tautan kedaluwarsa atau tidak valid', 'This link may have expired or already been used. Request a new one to continue.': 'Tautan ini mungkin sudah kedaluwarsa atau pernah dipakai. Minta tautan baru untuk lanjut.', 'Request a new verification link': 'Minta tautan verifikasi baru', 'Request a new reset link': 'Minta tautan baru untuk reset password', 'Back to sign in': 'Kembali ke halaman sign in', 'Check your inbox': 'Periksa kotak masukmu', 'Email verified': 'Email terverifikasi', 'Password changed': 'Password berhasil diubah', 'You can now sign in.': 'Sekarang kamu bisa sign in.', 'Continue to sign in': 'Lanjutkan ke sign in', 'Welcome back': 'Selamat datang kembali', 'Create your account': 'Buat akunmu',  'Choose a new password': 'Buat password baru', 'Verify your email': 'Verifikasi emailmu', 'Choose a password to finish setting up your account.': 'Pilih password untuk menyelesaikan pembuatan akun.', 'Your name': 'Namamu', 'Email address': 'Alamat email', 'Create password': 'Buat password', 'New password': 'Password baru', 'At least 12 characters.': 'Minimal 12 karakter.', 'Open the link from your email to continue.': 'Buka tautan dari emailmu untuk lanjut.', 'Please wait…': 'Tunggu ya…', 'Send verification link': 'Kirim tautan verifikasi', 'Send reset link': 'Kirim tautan untuk reset password', 'Verify and create account': 'Verifikasi dan buat akun', 'Save new password': 'Simpan password baru', 'Forgot password?': 'Lupa password?', 'New to Pocket Buddy?': 'Pertama kali menggunakan Pocket Buddy?', 'Create an account': 'Buat akun', 'Already have an account?': 'Sudah punya akun?', 'If an account exists for this email, you’ll receive a link to reset your password.': 'Kalau akun dengan email ini terdaftar, kami akan mengirim link untuk reset password.', 'If this email can be used to create an account, you’ll receive a verification link. Please wait a minute between requests.': 'Kalau email ini bisa digunakan untuk membuat akun, kami akan mengirim tautan verifikasi. Tunggu satu menit sebelum meminta tautan lagi.',
  'Discard your changes?': 'Buang perubahan?', 'Your unsaved changes will be lost.': 'Perubahan yang belum disimpan akan hilang.', 'Discard changes': 'Buang perubahan', 'Keep editing': 'Lanjutkan mengedit', 'Transaction restored': 'Transaksi dipulihkan', 'Could not restore transaction': 'Transaksi gagal dipulihkan. Coba lagi ya.', 'Restore transaction?': 'Pulihkan transaksi?', 'Restore transaction': 'Pulihkan transaksi',  'When you delete a transaction, you’ll find it here for 30 days.': 'Transaksi yang dihapus akan tersedia di sini selama 30 hari.', 'This page is still on the map': 'Halaman ini belum tersedia', 'Head back to your overview.': 'Kembali ke ringkasan.', 'Go to overview': 'Buka ringkasan',
  'More about recurring schedules': 'Tentang jadwal transaksi', 'More about budgets': 'Tentang budget', 'How recurring works': 'Cara kerja jadwal transaksi', 'About budgets': 'Tentang budget', 'A schedule creates a pending occurrence for you to review. It never changes your totals until you confirm it.': 'Jadwal membuat transaksi untuk kamu cek. Jumlah total nggak berubah sampai kamu konfirmasi.', 'Budgets guide spending; they don’t change your available cash. Parent and child category budgets are tracked separately.': 'Budget membantu mengatur pengeluaran dan tidak mengubah saldo tersedia. Budget kategori induk dan anak dihitung terpisah.',
  'Loading your account': 'Memuat akunmu', 'Getting things ready…': 'Menyiapkan semuanya…', 'Loading page': 'Memuat halaman', 'Loading': 'Memuat', 'Transaction': 'Transaksi', 'Budget': 'Budget', 'Schedule': 'Jadwal', 'Deleted': 'Dihapus', 'All periods': 'Semua periode', 'All spending': 'Semua pengeluaran', 'All groups': 'Semua grup', 'Next date': 'Tanggal berikutnya', 'Frequency': 'Frekuensi', 'Status': 'Status', 'Search transactions': 'Cari transaksi', 'Search budgets': 'Cari budget', 'Search schedules': 'Cari jadwal', 'Search categories': 'Cari kategori', 'Search deleted transactions': 'Cari transaksi yang dihapus',
  'January': 'Januari', 'February': 'Februari', 'March': 'Maret', 'April': 'April', 'May': 'Mei', 'June': 'Juni', 'July': 'Juli', 'August': 'Agustus', 'September': 'September', 'October': 'Oktober', 'November': 'November', 'December': 'Desember',
  'Jan': 'Jan', 'Feb': 'Feb', 'Mar': 'Mar', 'Apr': 'Apr', 'Jun': 'Jun', 'Jul': 'Jul', 'Aug': 'Agu', 'Sep': 'Sep', 'Oct': 'Okt', 'Nov': 'Nov', 'Dec': 'Des',
  'account and security': 'keamanan akun', 'Account menu': 'Menu akun', 'Dashboard month': 'Bulan dasbor', 'Previous month': 'Bulan sebelumnya', 'Choose dashboard month': 'Pilih bulan dasbor', 'Next month': 'Bulan berikutnya', 'From date': 'Tanggal mulai', 'To date': 'Tanggal akhir', 'Transaction rows': 'Daftar transaksi', 'How receipt scanning works': 'Cara kerja pemindaian nota', 'Schedule amount': 'Jumlah jadwal', 'General icon': 'Ikon umum', 'Home icon': 'Ikon rumah', 'Food icon': 'Ikon makanan', 'Shopping icon': 'Ikon belanja', 'Transport icon': 'Ikon transportasi', 'Health icon': 'Ikon kesehatan', 'Work icon': 'Ikon pekerjaan', 'Gifts icon': 'Ikon hadiah', 'Music icon': 'Ikon musik', 'Pets icon': 'Ikon hewan peliharaan', 'Travel icon': 'Ikon perjalanan', 'Learning icon': 'Ikon belajar', 'Clothing icon': 'Ikon pakaian', 'Money icon': 'Ikon uang', 'Wallet icon': 'Ikon dompet', 'Calendar icon': 'Ikon kalender', 'Receipt icon': 'Ikon nota', 'Tag icon': 'Ikon label', 'red color': 'warna merah', 'coral color': 'warna koral', 'orange color': 'warna oranye', 'lime color': 'warna hijau limau', 'teal color': 'warna hijau kebiruan', 'aqua color': 'warna aqua', 'blue color': 'warna biru', 'indigo color': 'warna nila', 'violet color': 'warna ungu', 'pink color': 'warna merah muda', 'rows': 'baris', 'Remove budget': 'Hapus budget',
  'Sunday': 'Minggu', 'Monday': 'Senin', 'Tuesday': 'Selasa', 'Wednesday': 'Rabu', 'Thursday': 'Kamis', 'Friday': 'Jumat', 'Saturday': 'Sabtu', 'Sun': 'Min', 'Mon': 'Sen', 'Tue': 'Sel', 'Wed': 'Rab', 'Thu': 'Kam', 'Fri': 'Jum', 'Sat': 'Sab',
  'Could not load your account data. Reload to try again.': 'Data akun gagal dimuat. Muat ulang halaman untuk coba lagi.', 'Could not check your sign-in status. Check your connection and retry.': 'Status sign in gagal diperiksa. Cek koneksi lalu coba lagi.', 'This account uses a currency that the financial screens do not support yet.': 'Akun ini menggunakan mata uang yang belum didukung oleh halaman keuangan.', 'Your category was saved, but your account could not be refreshed. Reload to continue.': 'Kategori tersimpan, tapi akun gagal dimuat ulang. Muat ulang halaman untuk lanjut.', 'Could not reach the server. Try again.': 'Server belum bisa dijangkau. Coba lagi ya.', 'Could not save name': 'Nama gagal disimpan. Coba lagi ya.', 'Could not delete account': 'Akun gagal dihapus. Coba lagi ya.', 'Parent category is no longer available': 'Kategori induk sudah tidak tersedia',
  'Occurrence skipped': 'Transaksi dilewati', 'Could not skip occurrence': 'Transaksi gagal dilewati. Coba lagi ya.', 'Occurrence added to transactions': 'Transaksi ditambahkan ke daftar transaksi', 'Could not save transaction': 'Transaksi gagal disimpan. Coba lagi ya.', 'Transaction updated': 'Transaksi diperbarui', 'Transaction saved': 'Transaksi tersimpan', 'A selected category is no longer available': 'Kategori yang dipilih sudah tidak tersedia', 'Moved to Recently deleted': 'Dipindahkan ke Baru saja dihapus', 'Could not delete transaction': 'Transaksi gagal dihapus. Coba lagi ya.', 'Could not delete category': 'Kategori gagal dihapus. Coba lagi ya.', 'Choose an available expense category.': 'Pilih kategori pengeluaran yang tersedia.', 'Budget created': 'Budget dibuat', 'This budget category is no longer available.': 'Kategori budget ini sudah tidak tersedia.', 'Budget saved': 'Budget tersimpan', 'Budget removed': 'Budget dihapus', 'Schedule saved': 'Jadwal tersimpan', 'Could not save schedule': 'Jadwal gagal disimpan. Coba lagi ya.', 'Schedule deleted': 'Jadwal dihapus', 'Could not delete schedule': 'Jadwal gagal dihapus. Coba lagi ya.', 'Schedule created': 'Jadwal dibuat', 'Category added': 'Kategori ditambahkan', 'Could not extract this image. Try again or enter it manually.': 'Data dari gambar ini gagal diambil. Coba lagi atau isi manual.', 'Could not save these transactions. Your drafts are still here.': 'Transaksi belum bisa disimpan. Draftmu masih ada.', 'No transactions found': 'Tidak ada transaksi', 'Add transactions': 'Tambah transaksi', 'Finish review': 'Selesai cek', 'Add remaining drafts?': 'Tambahkan draft yang tersisa?', 'Add complete drafts?': 'Tambahkan draft yang lengkap?', 'Skip the other drafts?': 'Lewati draft lainnya?', 'Skip these drafts?': 'Lewati draft ini?', 'Add complete drafts': 'Tambahkan draft lengkap', 'Skip drafts': 'Lewati draft', 'Extracting…': 'Mengekstrak…', 'Extract drafts': 'Ambil draft', 'Could not remove budget': 'Budget gagal dihapus. Coba lagi ya.', 'Enter a spending limit greater than zero.': 'Masukkan batas pengeluaran lebih dari nol.', 'A budget already exists for this category and period.': 'Budget untuk kategori dan periode ini sudah ada.', 'Could not create budget.': 'Budget gagal dibuat. Coba lagi ya.', 'Creating…': 'Membuat…', 'Create budget': 'Buat budget', 'Could not save budget.': 'Budget gagal disimpan. Coba lagi ya.', 'Save budget': 'Simpan budget', 'Could not remove budget.': 'Budget gagal dihapus. Coba lagi ya.', 'Could not save occurrence': 'Transaksi gagal disimpan. Coba lagi ya.', 'Could not create schedule': 'Jadwal gagal dibuat. Coba lagi ya.', 'Create schedule': 'Buat jadwal', 'This category will be removed. ': 'Kategori ini akan dihapus. ', 'Its subcategories will be kept as top-level categories. ': 'Subkategori akan dipertahankan sebagai kategori utama. ',  'A category with this name already exists. Choose a different name.': 'Kategori dengan nama ini sudah ada. Pilih nama lain.', 'Add a description and an amount greater than zero.': 'Tambahkan deskripsi dan jumlah lebih dari nol.', 'Save transaction': 'Simpan transaksi',   'Browser-local preview': 'Pratinjau lokal browser', 'Save name': 'Simpan nama', 'A–Z': 'A–Z', 'Z–A': 'Z–A', 'Spending %': 'Persentase pengeluaran', 'Remaining': 'Sisa', 'deleted transactions': 'transaksi yang dihapus', 'Date: newest first': 'Tanggal: terbaru', 'Date: oldest first': 'Tanggal: terlama', 'Amount: highest first': 'Jumlah: terbesar', 'Amount: lowest first': 'Jumlah: terkecil',
  'Your balance at the end of': 'Saldomu pada akhir', 'You’re keeping': 'Kamu menyisihkan', 'Choose your default transaction entry in': 'Pilih mode input transaksi default di', 'Skip draft': 'Lewati draft', 'Delete category': 'Hapus kategori', 'Demo': 'Demo', 'Income this month': 'Pemasukan bulan ini', 'Spent this month': 'Pengeluaran bulan ini', 'A GENTLE NUDGE': 'PENGINGAT', 'Budget check-in': 'Ringkasan budget', 'THIS MONTH': 'BULAN INI', 'That’s your income after this month’s spending.': 'Ini pemasukanmu setelah pengeluaran bulan ini.', 'Showing': 'Menampilkan', 'Net total': 'Total bersih', 'All time': 'Semua waktu', 'From': 'Dari', 'Filter transactions': 'Filter transaksi', 'Choose an end date on or after the start date.': 'Tanggal akhir harus sama dengan atau setelah tanggal mulai.', 'What happened?': 'Apa yang terjadi?', 'Keep it simple. You can fill in more later.': 'Isi seperlunya. Detail lainnya bisa ditambahkan nanti.', 'Scan a receipt': 'Scan nota', 'Scan another image': 'Scan gambar lain', 'Keep reviewing': 'Lanjut cek', 'Add ready drafts only': 'Tambahkan draft yang siap saja', 'Bring a receipt or screenshot': 'Pilih nota atau screenshot', 'One image at a time. We’ll turn it into editable drafts for you to review.': 'Pilih satu gambar. Nanti kami ubah jadi draft yang bisa kamu edit dan cek.', 'Click to preview full size': 'Klik untuk melihat ukuran penuh', 'Choose a different image': 'Pilih gambar lain', 'Drop an image here or browse': 'Drag gambar ke sini atau pilih filemu', 'PNG, JPG, or WEBP · one image at a time': 'PNG, JPG, atau WEBP · satu gambar setiap kali', 'Choose image': 'Pilih gambar', 'Enter manually': 'Masukkan secara manual', 'RECEIPT SCAN': 'SCAN NOTA', 'How it works': 'Cara kerjanya', 'HOW IT WORKS': 'CARA KERJANYA', 'Add one image': 'Tambahkan satu gambar', 'Receipt, order confirmation, or screenshot.': 'Nota, konfirmasi pesanan, atau screenshot.', 'Check the details': 'Cek detailnya', 'Edit, confirm, or skip each draft.': 'Edit, konfirmasi, atau lewati setiap draft.', 'Only confirmed items stay': 'Hanya item yang dikonfirmasi yang disimpan', 'The source image is discarded after extraction.': 'Gambar sumber dihapus setelah data diambil.', 'Your image is temporary': 'Gambarmu hanya dipakai sementara', 'Some details may be missing or unclear. Check the highlighted fields before adding.': 'Beberapa detail mungkin belum ada atau kurang jelas. Cek bagian yang ditandai sebelum menambahkan.', 'Review details': 'Cek detail', 'Choose a category': 'Pilih kategori', 'Try a clearer image or enter the transaction manually.': 'Coba pakai gambar yang lebih jelas atau masukkan transaksi secara manual.', 'Only drafts you confirm become transactions. Scanning sends your image to an external service. Pocket Buddy doesn’t save the image.': 'Hanya draft yang kamu konfirmasi yang jadi transaksi. Gambar dikirim ke layanan eksternal saat di-scan, tapi Pocket Buddy nggak menyimpannya.', 'New occurrences will wait here for your review.': 'Transaksi baru akan muncul di sini untuk kamu cek.', 'Looks good': 'Sudah sesuai', 'Active budgets': 'Budget aktif', 'Over budget': 'Melebihi budget', 'Within budget': 'Sesuai budget', 'Make a little room': 'Sisakan sedikit ruang', 'Budgets are a guide, not a grade.': 'Budget adalah panduan, bukan penilaian.', 'Remove': 'Hapus', 'Review occurrence': 'Cek transaksi', 'Add to transactions': 'Tambahkan ke transaksi', 'Back to recurring': 'Kembali ke jadwal', 'What comes around?': 'Apa yang akan datang?', 'We’ll make each occurrence a draft for you to review.': 'Setiap transaksi dalam jadwal jadi draft untuk kamu cek.', 'Save future details': 'Simpan detail untuk jadwal berikutnya', 'Edit profile name': 'Edit nama profil',
  'AVAILABLE CASH': 'SALDO TERSEDIA', 'Changes apply to this occurrence only. To update future occurrences, edit the recurring schedule.': 'Perubahan hanya berlaku untuk transaksi ini. Untuk mengubah transaksi berikutnya, edit jadwal transaksi.', 'Next occurrence': 'Transaksi berikutnya', 'Next occurrence date': 'Tanggal transaksi berikutnya', 'Repeats': 'Frekuensi', 'Schedule edits affect future occurrences. Each due item appears in Recurring for you to confirm, skip, or leave waiting.': 'Perubahan jadwal hanya berlaku untuk transaksi berikutnya. Transaksi yang jatuh tempo akan muncul di Jadwal untuk kamu konfirmasi, lewati, atau biarkan dulu.',
};

Object.assign(id, {
  'Reset your password': 'Atur ulang kata sandi',
  'Could not create account': 'Akun gagal dibuat. Coba lagi ya.',
  'Enter a valid email address': 'Masukkan alamat email yang valid.',
  'Enter an email address': 'Masukkan alamat email.',
  'Enter a name of 1 to 80 characters': 'Masukkan nama dengan panjang 1 sampai 80 karakter.',
  'Enter your email and password': 'Masukkan email dan kata sandi.',
  'Check your email and password. If your account needs verification, check your inbox.': 'Periksa email dan passwordmu. Jika akun perlu diverifikasi, cek kotak masuk email.',
  'Could not start session': 'Gagal memulai sesi. Coba lagi ya.',
  'Sign in required': 'Silakan sign in terlebih dahulu.',
  'Request origin is not allowed': 'Asal permintaan tidak diizinkan.',
  'CSRF validation failed': 'Validasi keamanan gagal. Muat ulang halaman lalu coba lagi.',
  'Try again later': 'Coba lagi nanti.',
  'Could not check the link. Try again.': 'Tautan gagal diperiksa. Coba lagi ya.',
  'Link is invalid or expired': 'Tautan tidak valid atau sudah kedaluwarsa.',
  'Enter a valid token and password': 'Masukkan token dan password yang valid.',
  'Could not save password': 'Password gagal disimpan. Coba lagi ya.',
  'Could not save password. Try again.': 'Password gagal disimpan. Coba lagi ya.',
  'Enter your password': 'Masukkan passwordmu.',
  'Password is incorrect': 'Password salah.',
  'Could not delete account': 'Akun gagal dihapus. Coba lagi ya.',
  'Enter a valid name': 'Masukkan nama yang valid.',
  'Could not load settings': 'Pengaturan gagal dimuat. Coba lagi ya.',
  'Currency, locale and integer openingBalance are required': 'Mata uang, bahasa, dan saldo awal dalam bilangan bulat wajib diisi.',
  'Invalid currency, locale or transaction entry default': 'Mata uang, bahasa, atau mode input transaksi tidak valid.',
  'Could not save settings': 'Pengaturan gagal disimpan. Coba lagi ya.',
  'Date must use YYYY-MM-DD': 'Format tanggal harus YYYY-MM-DD.',
  'Dates must use YYYY-MM-DD': 'Format tanggal harus YYYY-MM-DD.',
  'Could not load budgets': 'Budget gagal dimuat. Coba lagi ya.',
  'Could not load budget spending': 'Data pengeluaran budget gagal dimuat. Coba lagi ya.',
  'Enter a valid budget': 'Masukkan data budget yang valid.',
  'Choose an expense category': 'Pilih kategori pengeluaran.',
  'Budget not found': 'Budget tidak ditemukan.',
  'Choose an active expense category': 'Pilih kategori pengeluaran yang masih aktif.',
  'A budget already exists for this category and period': 'Budget untuk kategori dan periode ini sudah ada.',
  'Could not save budget': 'Budget gagal disimpan. Coba lagi ya.',
  'Could not remove budget': 'Budget gagal dihapus. Coba lagi ya.',
  'Could not load schedules': 'Jadwal gagal dimuat. Coba lagi ya.',
  'Invalid date': 'Tanggal tidak valid.',
  'Could not update occurrences': 'Transaksi terjadwal gagal diperbarui. Coba lagi ya.',
  'Invalid schedule': 'Jadwal tidak valid.',
  'Schedule not found': 'Jadwal tidak ditemukan.',
  'Could not save schedule': 'Jadwal gagal disimpan. Coba lagi ya.',
  'Could not delete schedule': 'Jadwal gagal dihapus. Coba lagi ya.',
  'Invalid transaction': 'Transaksi tidak valid.',
  'Occurrence is no longer pending': 'Transaksi ini sudah tidak menunggu untuk dicek.',
  'Could not update occurrence': 'Transaksi terjadwal gagal diperbarui. Coba lagi ya.',
  'Could not load categories': 'Kategori gagal dimuat. Coba lagi ya.',
  'Enter a valid category': 'Masukkan kategori yang valid.',
  'Category not found': 'Kategori tidak ditemukan.',
  'Invalid parent category': 'Kategori induk tidak valid.',
  'A category with this name already exists': 'Kategori dengan nama ini sudah ada.',
  'Invalid category or parent': 'Kategori atau kategori induk tidak valid.',
  'Could not save category': 'Kategori gagal disimpan. Coba lagi ya.',
  'Remove budgets using this category first': 'Hapus atau ubah budget yang memakai kategori ini terlebih dahulu.',
  'Could not delete category': 'Kategori gagal dihapus. Coba lagi ya.',
  'Choose at least one valid transaction': 'Pilih setidaknya satu transaksi yang valid.',
  'Enter valid transaction details': 'Masukkan detail transaksi yang valid.',
  'Category is invalid': 'Kategori tidak valid.',
  'Category is invalid for this transaction': 'Kategori tidak sesuai dengan jenis transaksi ini.',
  'Could not save transactions': 'Transaksi gagal disimpan. Coba lagi ya.',
  'Invalid kind': 'Jenis transaksi tidak valid.',
  'Invalid category': 'Kategori tidak valid.',
  'Start date must not be after end date': 'Tanggal mulai tidak boleh setelah tanggal akhir.',
  'Search is too long': 'Kata pencarian terlalu panjang.',
  'Invalid sort': 'Urutan tidak valid.',
  'Could not load transactions': 'Transaksi gagal dimuat. Coba lagi ya.',
  'Invalid page': 'Nomor halaman tidak valid.',
  'Invalid limit': 'Batas jumlah tidak valid.',
  'Enter a valid transaction': 'Masukkan transaksi yang valid.',
  'Description, merchant or note is too long': 'Deskripsi, nama toko, atau catatan terlalu panjang.',
  'Transaction not found': 'Transaksi tidak ditemukan.',
  'Could not save transaction': 'Transaksi gagal disimpan. Coba lagi ya.',
  'Could not delete transaction': 'Transaksi gagal dihapus. Coba lagi ya.',
  'Could not restore transaction': 'Transaksi gagal dipulihkan. Coba lagi ya.',
  'Transaction not found or restore period expired': 'Transaksi tidak ditemukan atau masa pemulihannya sudah habis.',
  'Receipt extraction is not configured yet': 'Fitur pemindaian nota belum dikonfigurasi.',
  'Choose an image smaller than 8 MB': 'Pilih gambar berukuran kurang dari 8 MB.',
  'Choose one image to extract': 'Pilih satu gambar untuk dipindai.',
  'Could not read that image': 'Gambar gagal dibaca.',
  'Use a JPEG, PNG, or WEBP image': 'Gunakan gambar JPEG, PNG, atau WEBP.',
  'Could not prepare extraction': 'Gambar gagal disiapkan untuk dipindai.',
  'The scan service is busy right now. Wait a moment and try again.': 'Layanan pemindaian sedang sibuk. Tunggu sebentar lalu coba lagi.',
  'The scan service is receiving too many requests. Wait a moment and try again.': 'Terlalu banyak permintaan ke layanan pemindaian. Tunggu sebentar lalu coba lagi.',
  'The scan couldn’t finish. Try again or enter the transaction manually.': 'Pemindaian gagal diselesaikan. Coba lagi atau masukkan transaksi secara manual.',
} satisfies Record<string, string>);

const propNames = ['aria-label', 'aria-valuetext', 'title', 'placeholder', 'alt'];

function translateText(value: string, language: Language): string {
  if (language === 'en') return value;
  if (id[value]) return id[value];
  const trimmed = value.trim();
  if (id[trimmed]) return value.replace(trimmed, id[trimmed]);
  // Translate longer fixed copy inside text nodes that also contain spacing
  // or a dynamic value, while leaving user-entered names and descriptions alone.
  let withFragments = [...Object.keys(id)].filter((key) => key.length >= 15).sort((a, b) => b.length - a.length).reduce((text, key) => text.replaceAll(key, id[key]), value)
    .replace('This will relabel your saved amounts from ', id['This will relabel your saved amounts from '])
    .replace(' without converting them. The numbers will stay the same.', id[' without converting them. The numbers will stay the same.'])
    .replace(/^No /, 'Belum ada ')
    .replace(/ yet$/, '');
  withFragments = withFragments.replace(/\b(JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER|JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\b/gi, (word) => {
    const key = Object.keys(id).find((candidate) => candidate.toLowerCase() === word.toLowerCase());
    const translated = key ? id[key] : word;
    return word === word.toUpperCase() ? translated.toUpperCase() : translated;
  });
  withFragments = withFragments.replace(/^PENDING REVIEW · /, 'PERLU DICEK · ');
  withFragments = withFragments.replace(/ · deleted /g, ' · dihapus ').replace(/ · next /g, ' · berikutnya ');
  const categoryBudget = withFragments.match(/^This category is used by (\d+) budgets? and cannot be deleted\. Remove or change the affected budgets first\.$/);
  if (categoryBudget) return `Kategori ini digunakan oleh ${categoryBudget[1]} budget dan tidak bisa dihapus. Hapus atau ubah budget terkait terlebih dahulu.`;
  const transactionDelete = withFragments.match(/^Move (.+) to (?:Recently deleted|Baru saja dihapus)\? You can restore it for 30 days\.$/);
  if (transactionDelete) return `Pindahkan ${transactionDelete[1]} ke Baru saja dihapus? Kamu bisa memulihkannya dalam 30 hari.`;
  const transactionRestore = withFragments.match(/^Restore (.+) to your transactions\? It will be included in your totals again\.$/);
  if (transactionRestore) return `Pulihkan ${transactionRestore[1]} ke daftar transaksi? Transaksi ini akan dihitung kembali dalam total kamu.`;
  const budgetDelete = withFragments.match(/^Remove the (.+) budget\? Transactions will remain\. This cannot be undone\.$/);
  if (budgetDelete) return `Hapus budget ${budgetDelete[1]}? Transaksi yang sudah ada tetap tersimpan. Tindakan ini nggak bisa dibatalkan.`;
  withFragments = withFragments
    .replace(' transactions, including recently deleted ones, will become uncategorized.', ' transaksi, termasuk yang baru saja dihapus, akan menjadi tanpa kategori.')
    .replace(' transactions will become uncategorized.', ' transaksi akan menjadi tanpa kategori.')
    .replace(' recently deleted transactions will become uncategorized.', ' transaksi yang baru saja dihapus akan menjadi tanpa kategori.')
    .replace(' recurring schedules will become uncategorized.', ' jadwal akan menjadi tanpa kategori.')
    .replace(' recurring schedule will become uncategorized.', ' jadwal akan menjadi tanpa kategori.');
  const foundTransactions = withFragments.match(/^We found (\d+) transactions?$/);
  if (foundTransactions) return `Berhasil menemukan ${foundTransactions[1]} transaksi`;
  const extractedFrom = withFragments.match(/^(Extracted from|Demo extraction from) (.+)\. Review each draft before saving\.$/);
  if (extractedFrom) return `${extractedFrom[1] === 'Extracted from' ? 'Hasil scan dari' : 'Hasil demo dari'} ${extractedFrom[2]}. Cek setiap draft sebelum disimpan.`;
  const draftNumber = withFragments.match(/^Draft (\d+)$/);
  if (draftNumber) return `Draft ${draftNumber[1]}`;
  const draftField = withFragments.match(/^Draft (\d+) (type|category|date)$/);
  if (draftField) return `${({ type: 'jenis', category: 'kategori', date: 'tanggal' } as Record<string, string>)[draftField[2]]} draft ${draftField[1]}`;
  const addAllDrafts = withFragments.match(/^Add all (\d+) drafts$/);
  if (addAllDrafts) return `Tambahkan semua ${addAllDrafts[1]} draft`;
  const addDraftsPrompt = withFragments.match(/^(\d+) drafts look complete, but you haven't confirmed them\. Add them as they are\? This will save all (\d+) drafts\.$/);
  if (addDraftsPrompt) return `Ada ${addDraftsPrompt[1]} draft yang terlihat lengkap, tapi belum kamu konfirmasi. Tambahkan apa adanya? Semua ${addDraftsPrompt[2]} draft akan disimpan.`;
  const completeDraftsPrompt = withFragments.match(/^There are (\d+) complete drafts and (\d+) that need more detail\. Add the complete drafts as entered and skip the incomplete ones\?$/);
  if (completeDraftsPrompt) return `Ada ${completeDraftsPrompt[1]} draft lengkap dan ${completeDraftsPrompt[2]} draft yang masih perlu dilengkapi. Tambahkan draft lengkap apa adanya dan lewati sisanya?`;
  const skipOtherDraftsPrompt = withFragments.match(/^(\d+) drafts haven't been confirmed, and at least one needs more detail\. Skip the unconfirmed drafts and add only the (\d+) ready transactions\?$/);
  if (skipOtherDraftsPrompt) return `Ada ${skipOtherDraftsPrompt[1]} draft yang belum dikonfirmasi dan setidaknya satu masih perlu dilengkapi. Lewati draft yang belum dikonfirmasi dan tambahkan hanya ${skipOtherDraftsPrompt[2]} transaksi yang siap?`;
  const skipDraftsPrompt = withFragments.match(/^These (\d+) drafts need more detail and haven't been confirmed\. Skip them without adding anything\?$/);
  if (skipDraftsPrompt) return `Ada ${skipDraftsPrompt[1]} draft yang masih perlu dilengkapi dan belum dikonfirmasi. Lewati semuanya tanpa menambahkan transaksi?`;
  const pageNumber = withFragments.match(/^Page (\d+)$/);
  if (pageNumber) return `Halaman ${pageNumber[1]}`;
  const accountMenu = withFragments.match(/^Account menu for (.+)$/);
  if (accountMenu) return `Menu akun ${accountMenu[1]}`;
  const listRows = withFragments.match(/^(.*) rows$/);
  if (listRows) return `Baris ${translateText(listRows[1], language)}`;
  const draftChecks = withFragments.match(/^Check (.+)$/);
  if (draftChecks) {
    const labels: Record<string, string> = { amount: 'jumlah', description: 'deskripsi', kind: 'jenis', category: 'kategori', date: 'tanggal', merchant: 'toko' };
    return `Cek ${draftChecks[1].split(', ').map((field) => labels[field] ?? field).join(', ')}`;
  }
  const addCount = withFragments.match(/^Add (\d+) (ready )?(transactions?|drafts)$/);
  if (addCount) return `${addCount[2] ? 'Tambahkan' : 'Tambah'} ${addCount[1]} ${addCount[3].startsWith('transaction') ? 'transaksi' : 'draft'}${addCount[2] ? ' yang siap' : ''}`;
  const prefix = /^(Search|Filter|Sort|Delete|Restore|Edit|Pause|Resume|Remove) (.+)$/;
  const prefixed = withFragments.match(prefix);
  if (prefixed) {
    const lead = ({ Search: 'Cari', Filter: 'Filter', Sort: 'Urutkan', Delete: 'Hapus', Restore: 'Pulihkan', Edit: 'Ubah', Pause: 'Jeda', Resume: 'Lanjutkan', Remove: 'Hapus' } as Record<string, string>)[prefixed[1]];
    return `${lead} ${translateText(prefixed[2], language)}`;
  }
  return withFragments.split(/( · |, )/).map((part) => {
    if (id[part]) return id[part];
    return part.replace(/\b(\d+)\s+(transactions|transaction|budgets|budget|schedules|schedule|entries)\b/g, (_match, count: string, noun: string) => `${count} ${id[noun]}`);
  }).join('');
}

export function translateUI(value: string): string {
  return translateText(value, activeLanguage);
}

export function getUILanguage(): Language {
  return activeLanguage;
}

const originals = new WeakMap<Node, string>();
const lastWritten = new WeakMap<Node, string>();
const originalAttributes = new WeakMap<Element, Map<string, string>>();
const lastWrittenAttributes = new WeakMap<Element, Map<string, string>>();

function localizeDocument(language: Language) {
  document.documentElement.lang = language === 'id' ? 'id' : 'en';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode: (candidate) => candidate.parentElement?.closest('script, style, noscript') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    if (lastWritten.get(node) !== textNode.data) originals.set(node, textNode.data);
    const source = originals.get(node) ?? textNode.data;
    const localized = translateText(source, language);
    if (localized !== textNode.data) textNode.data = localized;
    lastWritten.set(node, localized);
  }
  for (const element of document.body.querySelectorAll('*')) {
    for (const name of propNames) {
      if (!element.hasAttribute(name)) continue;
      let saved = originalAttributes.get(element);
      if (!saved) { saved = new Map(); originalAttributes.set(element, saved); }
      let written = lastWrittenAttributes.get(element);
      if (!written) { written = new Map(); lastWrittenAttributes.set(element, written); }
      const current = element.getAttribute(name) ?? '';
      if (written.get(name) !== current) saved.set(name, current);
      const source = saved.get(name) ?? current;
      const localized = translateText(source, language);
      if (localized !== current) element.setAttribute(name, localized);
      written.set(name, localized);
    }
  }
}

export function useLocalizedDocument(language: Language) {
  activeLanguage = language;
  useEffect(() => {
    localizeDocument(language);
    const observer = new MutationObserver(() => localizeDocument(language));
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: propNames });
    return () => observer.disconnect();
  }, [language]);
}
