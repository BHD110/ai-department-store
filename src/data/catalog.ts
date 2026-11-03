import { isEn } from '../i18n';
import type { Product } from '../types';

type Row = [string, string, string, string, Product['category'], number, number, number, string, string, string];

// sku, 中文名, 英文名, 英文短名, 品类(id 与服务端一致), 售价, 进价, 库存, 中文标签(逗号), 英文标签(逗号), emoji
const ROWS: Row[] = [
  ['C01', '柠檬洗洁精 1L', 'Lemon Dish Soap 1L', 'Lemon Soap', 'clean', 12.9, 7, 14, '柠檬香,大包装', 'lemon scent,bulk pack', '🧴'],
  ['C02', '无香洗洁精 500ml', 'Fragrance-Free Dish Soap 500ml', 'Gentle Soap', 'clean', 15.9, 9, 4, '无香,低敏', 'fragrance-free,hypoallergenic', '🧴'],
  ['C03', '薰衣草洗衣液 3kg', 'Lavender Laundry Detergent 3kg', 'Laundry Detergent', 'clean', 39.9, 24, 8, '香味,大包装', 'scented,bulk pack', '🫧'],
  ['C04', '婴儿洗衣液 1kg', 'Baby Laundry Detergent 1kg', 'Baby Detergent', 'clean', 29.9, 17, 5, '无香,低敏,儿童', 'fragrance-free,hypoallergenic,for kids', '🫧'],
  ['C05', '竹纤维抹布 5 片', 'Bamboo Cloth Wipes ×5', 'Cloth Wipes', 'clean', 9.9, 4, 20, '环保,可重复', 'eco-friendly,reusable', '🧽'],
  ['K01', '不粘煎锅 28cm', 'Non-Stick Frying Pan 28cm', 'Frying Pan', 'kitchen', 89, 52, 3, '耐用', 'durable', '🍳'],
  ['K02', '铸铁锅 24cm', 'Cast-Iron Pot 24cm', 'Cast-Iron Pot', 'kitchen', 159, 98, 2, '耐用,送礼', 'durable,gift', '🥘'],
  ['K03', '保鲜盒 4 件套', 'Food Containers ×4', 'Containers', 'kitchen', 35, 18, 10, '环保,可重复', 'eco-friendly,reusable', '🥡'],
  ['K04', '一次性纸杯 100 只', 'Disposable Cups ×100', 'Paper Cups', 'kitchen', 8.5, 4, 30, '一次性,大包装', 'disposable,bulk pack', '🥤'],
  ['W01', '温和洗发水 400ml', 'Gentle Shampoo 400ml', 'Shampoo', 'bath', 32, 18, 9, '低敏,无硅油', 'hypoallergenic,silicone-free', '🧴'],
  ['W02', '玫瑰沐浴露 750ml', 'Rose Body Wash 750ml', 'Body Wash', 'bath', 28, 15, 7, '香味', 'scented', '🌹'],
  ['W03', '儿童牙膏 草莓味', 'Kids Toothpaste, Strawberry', 'Kids Toothpaste', 'bath', 12, 6, 12, '儿童,低敏', 'for kids,hypoallergenic', '🪥'],
  ['W04', '护手霜礼盒', 'Hand Cream Gift Set', 'Hand Cream Set', 'bath', 68, 36, 4, '送礼,香味', 'gift,scented', '🎁'],
  ['S01', '中性笔 10 支', 'Gel Pens ×10', 'Gel Pens', 'stationery', 15, 7, 25, '学生,大包装', 'student,bulk pack', '🖊️'],
  ['S02', '错题本 A5', 'Mistake Notebook A5', 'Notebook', 'stationery', 6, 2.5, 18, '学生', 'student', '📒'],
  ['S03', '水彩笔 36 色', 'Watercolor Pens, 36 Colors', 'Watercolor Pens', 'stationery', 29, 15, 6, '儿童,送礼', 'for kids,gift', '🖍️'],
  ['F01', '无糖苏打饼干', 'Sugar-Free Soda Crackers', 'Crackers', 'snack', 9.9, 5, 15, '无糖,低卡', 'sugar-free,low-cal', '🍘'],
  ['F02', '坚果礼盒', 'Nut Gift Box', 'Nut Gift Box', 'snack', 98, 60, 5, '送礼,含坚果', 'gift,contains nuts', '🥜'],
  ['F03', '水果软糖', 'Fruit Gummies', 'Gummies', 'snack', 6.5, 3, 22, '儿童,含糖', 'for kids,sugary', '🍬'],
  ['F04', '燕麦片 1kg', 'Oatmeal 1kg', 'Oatmeal', 'snack', 26, 14, 8, '低卡,无糖', 'low-cal,sugar-free', '🥣'],
  ['H01', 'LED 灯泡 9W', 'LED Bulb 9W', 'LED Bulb', 'hardware', 11, 5, 16, '节能', 'energy-saving', '💡'],
  ['H02', '多功能工具箱', 'Multi-Tool Kit', 'Tool Kit', 'hardware', 129, 75, 2, '耐用,送礼', 'durable,gift', '🧰'],
  ['H03', '五号电池 8 粒', 'AA Batteries ×8', 'Batteries', 'hardware', 18, 9, 20, '大包装', 'bulk pack', '🔋'],
  ['B01', '纸尿裤 L 码 40 片', 'Diapers Size L ×40', 'Diapers L', 'family', 79, 50, 4, '儿童,低敏', 'for kids,hypoallergenic', '👶'],
  ['B02', '婴儿湿巾 80 抽', 'Baby Wipes ×80', 'Baby Wipes', 'family', 13.9, 7, 10, '儿童,无香,低敏', 'for kids,fragrance-free,hypoallergenic', '🧻'],
  ['J01', '香薰蜡烛', 'Scented Candle', 'Candle', 'home', 45, 22, 6, '香味,送礼', 'scented,gift', '🕯️'],
  ['J02', '收纳筐 大号', 'Storage Basket, Large', 'Storage Basket', 'home', 32, 16, 7, '环保', 'eco-friendly', '🧺'],
  ['J03', '晾衣架 10 只', 'Clothes Hangers ×10', 'Hangers', 'home', 19.9, 9, 12, '耐用', 'durable', '🪝'],
];

/** 货架、小签、mock 店主指名商品都用短名；英文长名按空格截会截错，所以数据里自带。 */
export function shortName(p: { short?: string; name: string }): string {
  return p.short ?? p.name.split(' ')[0];
}

export function createCatalog(): Product[] {
  const en = isEn();
  return ROWS.map(([sku, zhName, enName, enShort, category, price, cost, stock, zhTags, enTags, emoji]) => ({
    sku,
    name: en ? enName : zhName,
    short: en ? enShort : zhName.split(' ')[0],
    category,
    price,
    cost,
    stock,
    tags: (en ? enTags : zhTags).split(','),
    emoji,
  }));
}

/** 每天开门补货的目标库存 */
export const RESTOCK_TARGET: Record<string, number> = Object.fromEntries(
  ROWS.map((r) => [r[0], r[5]]),
);
