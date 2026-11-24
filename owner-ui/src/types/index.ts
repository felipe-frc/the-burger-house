export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivering' | 'completed' | 'cancelled';
export type PaymentMethod = 'PIX' | 'CREDIT_CARD' | 'DEBIT_CARD' | 'CASH' | 'UNKNOWN';
export type PaymentStatus = 'PAID' | 'PENDING' | 'REFUNDED' | 'FAILED' | 'UNKNOWN';
export type DeliveryType = 'DELIVERY' | 'TAKEOUT' | 'DINE_IN';

export interface OrderItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  notes?: string;
  category?: string;
}

export interface Order {
  id: string;
  code: string;
  customerName: string;
  customerPhone?: string;
  customerAvatar?: string;
  deliveryType: DeliveryType;
  deliveryAddress?: string;
  items: OrderItem[];
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
  serverStatus?: import('../services/ownerPresentation').ServerOrderStatus;
  createdAt: string;
  stageStartedAt?: string;
  stageHistory?: { status: import('../services/ownerPresentation').ServerOrderStatus; changedAt: string }[];
  estimatedMinutes: number;
  elapsedMinutes: number;
  isDelayed?: boolean;
  isStalePayment?: boolean;
  conferenceChecked?: boolean;
  conferenceChecklist?: { [itemId: string]: boolean };
  driverName?: string;
  driverPhone?: string;
}

export interface MenuItem {
  imageUrl?: string;
  uploadedImage?: boolean;
  englishName?: string;
  englishDescription?: string;
  costKnown?: boolean;
  id: string;
  name: string;
  category: 'burgers' | 'sides' | 'drinks' | 'desserts';
  price: number;
  cost: number;
  description: string;
  available: boolean;
  prepTimeMinutes: number;
  orderIndex: number;
  badge?: string;
}

export interface Customer {
  deliveryAddress?: string;
  purchases?: { orderId: number; createdAt: string; approvedAmount: number }[];
  id: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  lastOrderDate: string;
  favoriteBurger: string;
  status: 'vip' | 'regular' | 'new';
}

export interface TeamMember {
  id: string;
  name: string;
  role: 'Administrador' | 'Gerente' | 'Chef de Cozinha' | 'Chapeiro' | 'Atendente' | 'Entregador';
  department: 'Administração' | 'Cozinha' | 'Atendimento' | 'Logística';
  email: string;
  active: boolean;
  shift: string;
  avatar?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  description: string;
  time: string;
  type: 'order' | 'kitchen' | 'stock' | 'payment';
  read: boolean;
  severity: 'info' | 'warning' | 'alert' | 'success';
}

export interface AuditLog {
  id: string;
  action: string;
  time: string;
  user: string;
  type: 'order' | 'stock' | 'finance' | 'security';
}
