import { AssistantServiceResponse } from '@/types/services';
import { INITIAL_PRODUCTS } from './products';
import { INITIAL_POLICIES } from './policies';

export function getMockAssistantResponse(query: string): AssistantServiceResponse {
  const normalized = query.toLowerCase().trim();

  // 1. Human agent request
  if (
    normalized.includes('human') ||
    normalized.includes('agent') ||
    normalized.includes('insan') ||
    normalized.includes('rabta') ||
    normalized.includes('representative') ||
    normalized.includes('support team')
  ) {
    return {
      text: 'Aap ki request note kar li gayi hai. Hamari customer support team ka representative jald hi aap se rabta karega. (Human agent handoff simulated for demo).',
      isHumanHelpTriggered: true,
    };
  }

  // 2. Fresh perfumes inquiry
  if (
    normalized.includes('fresh') ||
    normalized.includes('garmi') ||
    normalized.includes('summer') ||
    normalized.includes('taza') ||
    normalized.includes('light')
  ) {
    const freshProduct = INITIAL_PRODUCTS.find((p) => p.category === 'fresh') || INITIAL_PRODUCTS[1];
    return {
      text: 'Daily use aur warm weather ke liye hamara sab se popular fresh scent Citrus Breeze hai. Is mein Italian bergamot aur fresh neroli ke vibrant notes hain jo din bhar taazgi dete hain.',
      recommendation: {
        id: freshProduct.id,
        name: freshProduct.name,
        size: freshProduct.size,
        price: freshProduct.price,
        description: freshProduct.description,
        image: freshProduct.image,
      },
    };
  }

  // 3. Gift suggestions inquiry
  if (
    normalized.includes('gift') ||
    normalized.includes('tofa') ||
    normalized.includes('present') ||
    normalized.includes('birthday') ||
    normalized.includes('anniversary')
  ) {
    const velvetOud = INITIAL_PRODUCTS.find((p) => p.id === 'prod-velvet-oud') || INITIAL_PRODUCTS[0];
    return {
      text: 'Gift ke liye hamara Velvet Oud (50ml) behtareen choice hai. Is ki presentation aur packaging premium hai aur fragrance unisex warm notes ke sath har kisi ko pasand aati hai.',
      recommendation: {
        id: velvetOud.id,
        name: velvetOud.name,
        size: velvetOud.size,
        price: velvetOud.price,
        description: velvetOud.description,
        image: velvetOud.image,
      },
    };
  }

  // 4. Delivery & Payment inquiry
  if (
    normalized.includes('delivery') ||
    normalized.includes('payment') ||
    normalized.includes('cod') ||
    normalized.includes('cash on delivery') ||
    normalized.includes('shipping') ||
    normalized.includes('charges')
  ) {
    return {
      text: `Hamari delivery poore Pakistan mein 2 se 4 working days mein TCS aur Trax ke zariye hoti hai.\n\n• Delivery charges: ${INITIAL_POLICIES.delivery.charges}\n• Free Delivery: PKR ${INITIAL_POLICIES.delivery.freeDeliveryThreshold.toLocaleString()} se zyada ke orders par delivery bilkul free hai.\n• Payment: Cash on Delivery (COD) har jagah dastiyab hai. Kisi qisam ki advance payment ki zaroorat nahi hai.`,
    };
  }

  // 5. Velvet Oud direct question
  if (normalized.includes('velvet oud') || normalized.includes('2500') || normalized.includes('oud')) {
    const velvetOud = INITIAL_PRODUCTS.find((p) => p.id === 'prod-velvet-oud') || INITIAL_PRODUCTS[0];
    return {
      text: 'Velvet Oud hamara signature evening fragrance hai. Is mein smoky agarwood aur sweet tonka bean ka behtareen tawazun hai. Long-lasting sillage 10-12 ghantay rehti hai.',
      recommendation: {
        id: velvetOud.id,
        name: velvetOud.name,
        size: velvetOud.size,
        price: velvetOud.price,
        description: velvetOud.description,
        image: velvetOud.image,
      },
    };
  }

  // 6. Amber Royale question
  if (normalized.includes('amber') || normalized.includes('royale') || normalized.includes('vanilla')) {
    const amber = INITIAL_PRODUCTS.find((p) => p.id === 'prod-amber-royale') || INITIAL_PRODUCTS[2];
    return {
      text: 'Amber Royale (100ml) ek deep aur warm oriental fragrance hai jisme Bourbon vanilla aur golden amber shamil hain. Khusoosan winter aur formal events ke liye ideal hai.',
      recommendation: {
        id: amber.id,
        name: amber.name,
        size: amber.size,
        price: amber.price,
        description: amber.description,
        image: amber.image,
      },
    };
  }

  // 7. Rose Noir question
  if (normalized.includes('rose') || normalized.includes('floral') || normalized.includes('gulab')) {
    const rose = INITIAL_PRODUCTS.find((p) => p.id === 'prod-rose-noir') || INITIAL_PRODUCTS[3];
    return {
      text: 'Rose Noir ek modern floral-spicy blend hai. Traditional gulab ke bajaye Damask rose aur pink peppercorn ka romantic contemporary andaz hai.',
      recommendation: {
        id: rose.id,
        name: rose.name,
        size: rose.size,
        price: rose.price,
        description: rose.description,
        image: rose.image,
      },
    };
  }

  // 8. Return / refund policy inquiry
  if (normalized.includes('return') || normalized.includes('refund') || normalized.includes('wapsi') || normalized.includes('exchange')) {
    return {
      text: `Hamari 7-day hassle-free return policy hai. Agar parcel transit mein damage ho ya unopened sealed box ho, to 7 dinon ke andar asani se exchange ya return kiya ja sakta hai.`,
    };
  }

  // Default fallback response
  return {
    text: 'Aap fragrance ke notes, pricing, COD payment, ya delivery time ke baray mein pooch sakte hain. Hamare paas Fresh, Floral, Woody aur Oriental scents mojood hain.',
  };
}

