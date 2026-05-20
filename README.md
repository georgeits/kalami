# მითოსი / Mitosi

Firebase-ზე დაფუძნებული პრემიუმ სააბონენტო პლატფორმა აბიტურიენტებისთვის ქართული ლიტერატურის სასწავლად.

## რა არის გაკეთებული

- Email/Password ავტორიზაცია Firebase Auth-ით
- `giorgijavakhishvili75@gmail.com` ავტომატურად ცნობილია როგორც `admin`
- სტუდენტის აბონენტური ფლოუ: `inactive` -> გადახდის ატვირთვა -> `pending` -> ადმინის დადასტურებით `active`
- გადახდის სქრინშოტების ატვირთვა Firebase Storage-ში
- კონტენტის რეალურ დროში წამოღება Firestore-იდან `onSnapshot`-ით
- ადმინ პანელი მომხმარებლებისა და კონტენტის სამართავად
- მუქი რეჟიმი
- რესპონსიული პრემიუმ UI
- seed-კონტენტი მოთხოვნილი ავტორებით

## Firestore სტრუქტურა

- `users/{uid}`
- `payments/{paymentId}`
- `authors/{authorId}`
- `authors/{authorId}/works/{workId}`

## გაშვების ინსტრუქცია

1. შექმენი Firebase Project.
2. ჩართე:
   - Authentication -> Email/Password
   - Firestore Database
   - Storage
   - Hosting
3. `data.js`-ში ჩასვი რეალური Firebase config.
4. განათავსე `firestore.rules` და `storage.rules`.
5. გაუშვი Firebase Hosting-ით:

```bash
firebase login
firebase init hosting
firebase deploy
```

## შენიშვნა

- seed-კონტენტი ავტომატურად იტვირთება, თუ `authors` კოლექცია ცარიელია.
- 30-დღიანი ვადის გასვლის შემოწმება ახლა client-side ლოგიკით კეთდება. თუ გინდა, შემდეგ ეტაპზე შეგვიძლია ამას დავუმატოთ Cloud Functions-იც, რომ expiry სრულად სერვერზე გადავიტანოთ.
