const express = require('express');
const fs = require('fs');
const path = require('path');

class QrisAPI {
    constructor() {
        this.pendingPayments = new Map();
    }

    setupEndpoint(app, bot) {
        app.get('/api/qris-callback', (req, res) => {
            res.status(200).json({ 
                status: 'ok',
                message: 'QRIS callback endpoint is running',
                pendingPayments: this.pendingPayments.size
            });
        });

        app.post('/api/qris-callback', express.json(), express.urlencoded({ extended: true }), async (req, res) => {
            try {
                console.log('\n==================== QRIS CALLBACK ====================');
                console.log('📥 Request received at:', new Date().toISOString());
                console.log('📦 Body:', JSON.stringify(req.body, null, 2));
                
                let notification = req.body;
                
                if (!notification || typeof notification !== 'object') {
                    console.error('❌ Invalid notification format');
                    console.log('======================================================\n');
                    return res.status(400).json({ success: false, message: 'Invalid notification format' });
                }

                const formattedNotification = {
                    name: notification.name || '',
                    pkg: notification.pkg || '',
                    title: notification.title || '',
                    text: notification.text || '',
                    subtext: notification.subtext || ''
                };
                
                console.log('📱 Formatted notification:');
                console.log('   - Package:', formattedNotification.pkg);
                console.log('   - Title:', formattedNotification.title);
                console.log('   - Text:', formattedNotification.text);
                
                // Check if it's Nobu Bank notification by package OR text pattern
                const isNobuPackage = formattedNotification.pkg === 'com.bnc.finance';
                const isNobuText = formattedNotification.text?.includes('Pembayaran QRIS diterima') || 
                                   formattedNotification.text?.includes('akan dikreditkan ke Tabungan');
                
                if (!isNobuPackage && !isNobuText) {
                    console.log('⚠️  Not Nobu Bank notification, ignored');
                    console.log('======================================================\n');
                    return res.json({ success: true, message: 'Not a Nobu notification, ignored' });
                }
                
                console.log('✅ Nobu notification confirmed (pkg:', isNobuPackage, 'text:', isNobuText, ')');

                // Improved regex to handle various formats: Rp1234, Rp1.234, Rp1,234
                const amountMatch = formattedNotification.text?.match(/Rp([\d.,]+)\s+akan\s+dikreditkan/i);
                if (!amountMatch) {
                    console.log('❌ Amount not found in text');
                    console.log('   Full text:', formattedNotification.text);
                    console.log('======================================================\n');
                    return res.status(400).json({ success: false, message: 'Invalid amount format' });
                }

                // Remove separators (dots/commas) and parse
                const amountString = amountMatch[1].replace(/[.,]/g, '');
                const amount = parseInt(amountString);
                console.log('💰 Amount detected:', amount, '(raw:', amountMatch[1], ')');
                
                let foundPayment = null;
                let foundPaymentId = null;

                console.log('🔍 Searching in', this.pendingPayments.size, 'pending payments:');
                for (const [paymentId, payment] of this.pendingPayments.entries()) {
                    console.log(`\n   Payment: ${paymentId}`);
                    console.log(`     User ID: ${payment.userId}`);
                    console.log(`     Product: ${payment.productName}`);
                    console.log(`     Quantity: ${payment.quantity}`);
                    console.log(`     Subtotal: ${payment.subtotal}`);
                    console.log(`     Unique Code: ${payment.uniqueCode}`);
                    console.log(`     Total: ${payment.total}`);
                    console.log(`     Match: ${payment.total === amount ? '✅ YES' : '❌ NO'}`);
                    
                    if (payment.total === amount) {
                        foundPayment = payment;
                        foundPaymentId = paymentId;
                        console.log('   >>> MATCH FOUND! <<<');
                        break;
                    }
                }

                if (!foundPayment) {
                    console.log('\n❌ NO MATCHING PAYMENT FOUND!');
                    console.log('   Looking for amount:', amount);
                    console.log('======================================================\n');
                    return res.status(404).json({ success: false, message: 'Payment not found' });
                }
                
                console.log('\n✅ Payment matched! Processing...');
                console.log('   Payment type:', foundPayment.type || 'product');
                
                try {
                    const { getUser, updateBalance } = require('../database/users');
                    
                    const user = getUser(foundPayment.userId);
                    
                    if (!user) {
                        console.log('❌ User not found:', foundPayment.userId);
                        console.log('======================================================\n');
                        return res.status(404).json({ success: false, message: 'User not found' });
                    }

                    console.log('👤 User found:', user.username);
                    
                    // Check if this is a deposit
                    if (foundPayment.type === 'deposit') {
                        console.log('💳 Processing DEPOSIT...');
                        
                        // Add balance to user
                        updateBalance(foundPayment.userId, foundPayment.amount);
                        console.log(`✅ Balance added: Rp ${foundPayment.amount.toLocaleString('id-ID')}`);
                        
                        // Remove from pending
                        this.pendingPayments.delete(foundPaymentId);
                        console.log('🗑️  Removed from pending payments');
                        
                        // Delete QRIS message
                        if (foundPayment.messageToDelete) {
                            try {
                                await bot.telegram.deleteMessage(foundPayment.userId, foundPayment.messageToDelete);
                                console.log('🗑️  QRIS message deleted');
                            } catch (err) {
                                console.log('⚠️  Could not delete QRIS message:', err.message);
                            }
                        }
                        
                        // Send success notification
                        const { Markup } = require('telegraf');
                        await bot.telegram.sendMessage(
                            foundPayment.userId,
                            `✅ *ᴅᴇᴘᴏꜱɪᴛ ʙᴇʀʜᴀꜱɪʟ*\n\n` +
                            `💰 ᴊᴜᴍʟᴀʜ: Rp ${foundPayment.amount.toLocaleString('id-ID')}\n` +
                            `🔢 ᴋᴏᴅᴇ ᴜɴɪᴋ: +Rp ${foundPayment.uniqueCode}\n` +
                            `💳 ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ: Rp ${foundPayment.total.toLocaleString('id-ID')}\n` +
                            `🏦 ᴍᴇᴛᴏᴅᴇ: QRIS (Nobu Bank)\n\n` +
                            `💰 *ꜱᴀʟᴅᴏ ꜱᴇᴋᴀʀᴀɴɢ: Rp ${(user.balance + foundPayment.amount).toLocaleString('id-ID')}*\n\n` +
                            `🆔 ʀᴇꜰ: \`${foundPaymentId}\`\n` +
                            `📅 ᴡᴀᴋᴛᴜ: ${new Date().toLocaleString('id-ID')}\n\n` +
                            `🎉 ᴛᴇʀɪᴍᴀ ᴋᴀꜱɪʜ!\n\n` +
                            `💡 Ketik /start untuk kembali ke menu`,
                            { 
                                parse_mode: 'Markdown',
                                reply_markup: Markup.keyboard([
                                    [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('📦 All Stock')],
                                    [Markup.button.text('📖 Cara Order'), Markup.button.text('👤 Admin')]
                                ]).resize().reply_markup
                            }
                        );
                        
                        console.log('✅ ᴅᴇᴘᴏꜱɪᴛ ʙᴇʀʜᴀꜱɪʟ -', user.username, '+Rp', foundPayment.amount.toLocaleString('id-ID'));
                        console.log('======================================================\n');
                        
                        return res.json({ 
                            success: true, 
                            message: 'Deposit successful',
                            type: 'deposit',
                            amount: foundPayment.amount 
                        });
                    }
                    
                    // Process product purchase
                    console.log('� Processing PRODUCT PURCHASE...');
                    const { useStock } = require('../database/stocks');

                    console.log('📦 Attempting to get stock for:', foundPayment.productCode, 'qty:', foundPayment.quantity);
                    const stocks = useStock(foundPayment.productCode, foundPayment.quantity);
                    
                    console.log('📦 Stock result:', stocks);
                    
                    if (!stocks || stocks.length === 0) {
                        console.log('❌ Failed to get stock or stock is empty');
                        await bot.telegram.sendMessage(
                            foundPayment.userId,
                            `❌ *ᴘᴇᴍʙᴀʏᴀʀᴀɴ ᴅɪᴛᴇʀɪᴍᴀ*\n\n` +
                            `⚠️ ꜱᴛᴏᴋ ᴛɪᴅᴀᴋ ᴛᴇʀꜱᴇᴅɪᴀ!\n\n` +
                            `💰 ᴛᴏᴛᴀʟ: Rp ${foundPayment.total.toLocaleString('id-ID')}\n` +
                            `📦 ᴘʀᴏᴅᴜᴋ: ${foundPayment.productName}\n\n` +
                            `🙏 ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ ᴜɴᴛᴜᴋ ᴘᴇɴɢᴇᴍʙᴀʟɪᴀɴ ᴅᴀɴᴀ.\n` +
                            `🆔 ʀᴇꜰ: \`${foundPaymentId}\``,
                            { parse_mode: 'Markdown' }
                        );
                        console.log('======================================================\n');
                        return res.status(500).json({ success: false, message: 'Stock not available' });
                    }
                    
                    console.log('✅ Stock retrieved successfully, count:', stocks.length);

                    this.pendingPayments.delete(foundPaymentId);
                    console.log('🗑️  Removed from pending payments');

                    if (foundPayment.messageToDelete) {
                        try {
                            await bot.telegram.deleteMessage(
                                foundPayment.userId,
                                foundPayment.messageToDelete
                            );
                            console.log('🗑️  QR message deleted');
                        } catch (error) {
                            console.log('⚠️  Could not delete QR message:', error.message);
                        }
                    }

                    let accountDetails = '';
                    stocks.forEach((stock, index) => {
                        accountDetails += `\n${index + 1}. ${stock.detail}`;
                    });
                    
                    console.log('📝 Account details prepared:', accountDetails);

                    await bot.telegram.sendMessage(
                        foundPayment.userId,
                        `✅ *ᴘᴇᴍʙᴀʏᴀʀᴀɴ ʙᴇʀʜᴀꜱɪʟ*\n\n` +
                        `📦 ᴘʀᴏᴅᴜᴋ: ${foundPayment.productName}\n` +
                        `📦 ᴊᴜᴍʟᴀʜ: ${foundPayment.quantity}\n` +
                        `💰 ꜱᴜʙᴛᴏᴛᴀʟ: Rp ${foundPayment.subtotal.toLocaleString('id-ID')}\n` +
                        `🔢 ᴋᴏᴅᴇ ᴜɴɪᴋ: +Rp ${foundPayment.uniqueCode}\n` +
                        `� ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ: Rp ${foundPayment.total.toLocaleString('id-ID')}\n` +
                        `🏦 ᴍᴇᴛᴏᴅᴇ: QRIS (Nobu Bank)\n\n` +
                        `🆔 ʀᴇꜰ: \`${foundPaymentId}\`\n` +
                        `📅 ᴡᴀᴋᴛᴜ: ${new Date().toLocaleString('id-ID')}\n\n` +
                        `🎉 ᴛᴇʀɪᴍᴀ ᴋᴀꜱɪʜ!`,
                        { parse_mode: 'Markdown' }
                    );
                    console.log('✅ Confirmation message sent');

                    if (accountDetails && accountDetails.trim() !== '') {
                        await bot.telegram.sendMessage(
                            foundPayment.userId,
                            `🎉 *ᴅᴇᴛᴀɪʟ ᴘʀᴏᴅᴜᴋ:*${accountDetails}\n\n⚠️ *ꜱɪᴍᴘᴀɴ ᴅᴀᴛᴀ ɪɴɪ ᴅᴇɴɢᴀɴ ʙᴀɪᴋ!*`,
                            { parse_mode: 'Markdown' }
                        );
                        console.log('✅ Product details sent to user');
                    } else {
                        console.log('⚠️  Account details empty, not sending');
                    }
                    
                    console.log('✅ Success message sent to user');
                    console.log('✅ ᴘᴇᴍʙᴀʏᴀʀᴀɴ ʙᴇʀʜᴀꜱɪʟ -', user.username, '+', foundPayment.productName, 'x', foundPayment.quantity);
                    console.log('======================================================\n');

                    return res.json({ success: true, message: 'Payment processed successfully' });
                    
                } catch (error) {
                    console.error('❌ Error processing payment:', error);
                    console.log('======================================================\n');
                    return res.status(500).json({ success: false, message: error.message });
                }

            } catch (error) {
                console.error('❌ Fatal error:', error);
                console.log('======================================================\n');
                return res.status(500).json({ success: false, message: error.message });
            }
        });
    }

    addPendingPayment(paymentId, paymentData) {
        this.pendingPayments.set(paymentId, paymentData);
        console.log('💳 Added pending payment:', paymentId);
        console.log('   Total amount:', paymentData.total);
    }

    removePendingPayment(paymentId) {
        return this.pendingPayments.delete(paymentId);
    }

    getPendingPayment(paymentId) {
        return this.pendingPayments.get(paymentId);
    }

    getAllPendingPayments() {
        return Array.from(this.pendingPayments.entries());
    }
}

module.exports = QrisAPI;
